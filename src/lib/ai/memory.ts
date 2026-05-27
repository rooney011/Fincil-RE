/**
 * AgentMem wiring for the council debate. EXPERIMENTAL — gated behind
 * `features.agentmem` + presence of AGENTMEM_API_KEY.
 *
 * This module is the ONLY place that imports AgentMem. Everything it exports
 * degrades to a no-op when memory is disabled, so callers never branch on the
 * feature flag themselves.
 *
 * Design:
 * - Each persona is a distinct `agentId` ("miser" | "visionary" | "twin").
 * - `workflowId` is the user's id → memories are isolated per user, durable
 *   across sessions (lifetime memory, not per-session).
 * - `scope: "team"` → personas can recall each other's memories within the
 *   same user's workflow. (A "private" scope would silo each persona.)
 *
 * RECALL STRATEGY (Block G — iteration 04):
 * We do NOT use `createAgentMemMiddleware`. The middleware is opaque — it hides
 * the search latency and what it injects, which made the iteration-03 benchmark
 * untrustworthy (couldn't separate AgentMem time from OpenAI time). Instead we
 * call `searchMemories` directly so we can:
 *   - time JUST the AgentMem call (the real "memory tax"),
 *   - log the hits + scores per turn,
 *   - control the query (we search with the purchase intent `input.query`, not
 *     the whole formatted prompt — Block I refinement).
 * The caller prepends `RecallResult.text` to the persona system prompt itself.
 *
 * See notes/agentmem-test/ for the evaluation log + benchmark data.
 */

import { searchMemories } from "@agentmem/vercel-ai-provider";
import { MemoryStore } from "@agentmem/sdk";

import { features } from "@/lib/env";

const apiKey = process.env.AGENTMEM_API_KEY;

/** Memory is live only when the flag is on AND a key is present. */
export const memoryEnabled: boolean = features.agentmem && !!apiKey;

const RECALL_PREFIX =
  "WHAT THE COUNCIL HAS SEEN BEFORE FROM THIS USER. If any of this is relevant " +
  "to the current decision, build on it explicitly — note what the council " +
  "decided last time and how this purchase compares. Never contradict the " +
  "current math verdict.";

/**
 * Block I: only inject memories the reranker rates this relevant (0–1). The raw
 * hybrid `score` can't separate related from unrelated (both sit ~0.016), so we
 * require `rerank:true` to get a real `relevance_score`. Calibration
 * (`calibrate-relevance.mts`): near-exact=1.0, related=0.7, same-category=0.1,
 * unrelated≈0.016. 0.3 keeps related, drops the rest with margin on both sides.
 */
// Env-tunable (Block M). Defaults: rerank ON, threshold 0.3. Operators can set
// AGENTMEM_RERANK=false to stop paying rerank latency / silent degradation,
// accepting "no relevance gating" (inject top semantic hit when threshold≤0).
const RECALL_RERANK = process.env.AGENTMEM_RERANK !== "false";
const RECALL_MIN_RELEVANCE = Number.isFinite(
  Number(process.env.AGENTMEM_MIN_RELEVANCE),
)
  ? Number(process.env.AGENTMEM_MIN_RELEVANCE)
  : 0.3;

/** Per-debate recall telemetry, surfaced to callers via `DebateInput.onRecall`. */
export type RecallMetric = {
  agentId: string;
  round: number;
  /** Milliseconds spent in the AgentMem search call alone. */
  ms: number;
  /** Hits returned by search (before the relevance filter). */
  hitCount: number;
  /** Hits that cleared RECALL_MIN_RELEVANCE and were injected. */
  keptCount: number;
  /** Best relevance_score among returned hits (rerank), or null. */
  topRelevance: number | null;
  /** Length of the memory block injected into the prompt (0 = nothing). */
  injectedChars: number;
};

export type RecallResult = {
  /** Formatted memory block to inject into the task prompt; "" if none kept. */
  text: string;
  ms: number;
  hitCount: number;
  keptCount: number;
  topRelevance: number | null;
  hits: { score: number; relevance: number | null; content: string }[];
};

const EMPTY_RECALL: RecallResult = {
  text: "",
  ms: 0,
  hitCount: 0,
  keptCount: 0,
  topRelevance: null,
  hits: [],
};

/**
 * Search this user's memory for context relevant to the current purchase,
 * rerank, and return a block of only the memories that clear the relevance
 * threshold — ready to inject into the task prompt. Instrumented: returned `ms`
 * is the AgentMem search+rerank time only. No-op (empty result) when memory is
 * disabled or no userId. Best-effort — a search failure is logged and swallowed.
 */
export async function recallMemories(opts: {
  agentId: string;
  userId?: string;
  query: string;
}): Promise<RecallResult> {
  if (!memoryEnabled || !opts.userId) return EMPTY_RECALL;

  const t0 = Date.now();
  try {
    const hits = await searchMemories(opts.query, {
      apiKey: apiKey!,
      agentId: opts.agentId,
      workflowId: opts.userId,
      scope: "team",
      topK: 3,
      rerank: RECALL_RERANK,
    });
    const ms = Date.now() - t0;

    // Relevance after rerank (falls back to raw score if rerank gave nothing).
    const rel = (h: (typeof hits)[number]) => h.relevance_score ?? h.score ?? 0;
    const kept = hits.filter((h) => rel(h) >= RECALL_MIN_RELEVANCE);
    const topRelevance = hits.length ? rel(hits[0]) : null;

    // Observability: rerank degrades silently under load (relevance collapses to
    // the raw score, ~0.03). When that happens nothing clears the threshold, so
    // recall safely injects nothing — but log it, because "no memory injected"
    // then means "couldn't judge relevance", NOT "no memory exists".
    const reranked = hits.some(
      (h) =>
        h.relevance_score != null &&
        Math.abs(h.relevance_score - (h.score ?? 0)) > 1e-6,
    );
    if (hits.length && !reranked) {
      console.warn(
        `[memory] rerank appears unavailable (relevance==raw, ~${topRelevance?.toFixed?.(3)}); recall conservatively injecting nothing despite ${hits.length} stored hit(s)`,
      );
    }

    console.info(
      `[memory] recall agent=${opts.agentId} ms=${ms} hits=${hits.length} kept=${kept.length} topRel=${topRelevance?.toFixed?.(4) ?? "?"} reranked=${reranked} (threshold ${RECALL_MIN_RELEVANCE})`,
    );

    if (!kept.length) {
      return { ...EMPTY_RECALL, ms, hitCount: hits.length, topRelevance };
    }

    const text = `${RECALL_PREFIX}\n${kept.map((h) => `- ${h.content}`).join("\n")}`;
    return {
      text,
      ms,
      hitCount: hits.length,
      keptCount: kept.length,
      topRelevance,
      hits: kept.map((h) => ({
        score: h.score,
        relevance: h.relevance_score ?? null,
        content: h.content,
      })),
    };
  } catch (e) {
    const ms = Date.now() - t0;
    console.warn(`[memory] recall failed after ${ms}ms; continuing without:`, e);
    return { ...EMPTY_RECALL, ms };
  }
}

let store: MemoryStore | null = null;
function getStore(): MemoryStore | null {
  if (!memoryEnabled) return null;
  if (!store) store = new MemoryStore({ apiKey: apiKey! });
  return store;
}

/** Result of a debate-memory write — `ms` is the AgentMem write time. */
export type WriteMetric = { ms: number; ok: boolean };

/** Financial context attached to a stored debate, so recall is actionable. */
export type DebateSnapshot = {
  surplus: number;
  emiImpactPercent: number;
  safety: string;
};

/**
 * Persist a RICH summary of a completed debate so future sessions can recall
 * something actionable — not just the verdict, but the financial situation at
 * the time and each side's closing argument (Block K). Written under agentId
 * "twin" / scope "team" so all personas see it next time.
 *
 * Block K hypothesis: a one-line verdict was too thin for personas to use; a
 * verdict + math + the actual arguments gives them something to build on.
 *
 * Best-effort: a failure is logged and swallowed — never breaks the response.
 * Returns timing so the benchmark can record the write tax.
 */
export async function rememberDebate(args: {
  userId?: string;
  query: string;
  amount: number;
  category?: string;
  verdict: "approved" | "rejected";
  snapshot?: DebateSnapshot;
  miserClosing?: string;
  visionaryClosing?: string;
}): Promise<WriteMetric> {
  const s = getStore();
  if (!s || !args.userId) return { ms: 0, ok: false };

  const date = new Date().toISOString().slice(0, 10);
  const cat = args.category ? ` (${args.category})` : "";
  const emi = args.snapshot
    ? Number.isFinite(args.snapshot.emiImpactPercent)
      ? `${Math.round(args.snapshot.emiImpactPercent)}% of surplus`
      : "more than the entire surplus"
    : "unknown";
  const lines = [
    `On ${date}, the user considered: "${args.query}" — ₹${args.amount.toLocaleString("en-IN")}${cat}.`,
    `Council verdict: ${args.verdict.toUpperCase()}.`,
    args.snapshot
      ? `Financials then: monthly surplus ₹${args.snapshot.surplus.toLocaleString("en-IN")}, estimated EMI ${emi}, safety "${args.snapshot.safety}".`
      : "",
    args.miserClosing ? `The Miser's closing concern: "${args.miserClosing}"` : "",
    args.visionaryClosing ? `The Visionary's closing case: "${args.visionaryClosing}"` : "",
  ].filter(Boolean);

  const t0 = Date.now();
  try {
    await s.write({
      content: lines.join("\n"),
      agentId: "twin",
      workflowId: args.userId,
      scope: "team",
      role: "observer",
    });
    const ms = Date.now() - t0;
    console.info(`[memory] debate write ms=${ms} verdict=${args.verdict} chars=${lines.join("\n").length}`);
    return { ms, ok: true };
  } catch (e) {
    const ms = Date.now() - t0;
    console.warn(`[memory] debate write failed after ${ms}ms; continuing:`, e);
    return { ms, ok: false };
  }
}
