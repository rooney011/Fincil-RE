/**
 * AgentMem backend for the council debate. One of the pluggable memory backends
 * (see memory-types.ts `MemoryBackend`); selected when MEMORY_PROVIDER=agentmem
 * (the default). Gated behind `features.agentmem` + presence of AGENTMEM_API_KEY.
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
 * RECALL STRATEGY (Block G — iteration 04): we call `searchMemories` directly
 * rather than `createAgentMemMiddleware` so we can time JUST the AgentMem call,
 * log the hits + scores, and control the query. The caller prepends
 * `RecallResult.text` to the persona task prompt itself.
 *
 * See notes/agentmem-test/ for the evaluation log + benchmark data.
 */

import { searchMemories } from "@agentmem/vercel-ai-provider";
import { MemoryStore } from "@agentmem/sdk";

import { features } from "@/lib/env";
import {
  EMPTY_RECALL,
  RECALL_PREFIX,
  formatDebateMemory,
  type RecallArgs,
  type RecallResult,
  type RememberDebateArgs,
  type WriteMetric,
} from "./memory-types";

const apiKey = process.env.AGENTMEM_API_KEY;

/** Memory is live only when the flag is on AND a key is present. */
export const memoryEnabled: boolean = features.agentmem && !!apiKey;

/**
 * Block I: only inject memories the reranker rates this relevant (0–1). The raw
 * hybrid `score` can't separate related from unrelated (both sit ~0.016), so we
 * require `rerank:true` to get a real `relevance_score`. Calibration
 * (`calibrate-relevance.mts`): near-exact=1.0, related=0.7, same-category=0.1,
 * unrelated≈0.016. 0.3 keeps related, drops the rest with margin on both sides.
 *
 * Env-tunable (Block M). Defaults: rerank ON, threshold 0.3. Operators can set
 * AGENTMEM_RERANK=false to stop paying rerank latency / silent degradation.
 */
const RECALL_RERANK = process.env.AGENTMEM_RERANK !== "false";
const RECALL_MIN_RELEVANCE = Number.isFinite(
  Number(process.env.AGENTMEM_MIN_RELEVANCE),
)
  ? Number(process.env.AGENTMEM_MIN_RELEVANCE)
  : 0.3;

/**
 * Search this user's memory for context relevant to the current purchase,
 * rerank, and return a block of only the memories that clear the relevance
 * threshold — ready to inject into the task prompt. Instrumented: returned `ms`
 * is the AgentMem search+rerank time only. No-op (empty result) when memory is
 * disabled or no userId. Best-effort — a search failure is logged and swallowed.
 */
export async function recallMemories(opts: RecallArgs): Promise<RecallResult> {
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
        `[memory:agentmem] rerank appears unavailable (relevance==raw, ~${topRelevance?.toFixed?.(3)}); recall conservatively injecting nothing despite ${hits.length} stored hit(s)`,
      );
    }

    console.info(
      `[memory:agentmem] recall agent=${opts.agentId} ms=${ms} hits=${hits.length} kept=${kept.length} topRel=${topRelevance?.toFixed?.(4) ?? "?"} reranked=${reranked} (threshold ${RECALL_MIN_RELEVANCE})`,
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
    console.warn(
      `[memory:agentmem] recall failed after ${ms}ms; continuing without:`,
      e,
    );
    return { ...EMPTY_RECALL, ms };
  }
}

let store: MemoryStore | null = null;
function getStore(): MemoryStore | null {
  if (!memoryEnabled) return null;
  if (!store) store = new MemoryStore({ apiKey: apiKey! });
  return store;
}

/**
 * Persist a RICH summary of a completed debate (verdict + the math then + each
 * side's closing argument, Block K) so future sessions can recall something
 * actionable. Written under agentId "twin" / scope "team" so all personas see it.
 * Best-effort: a failure is logged and swallowed. Returns timing for the benchmark.
 */
export async function rememberDebate(
  args: RememberDebateArgs,
): Promise<WriteMetric> {
  const s = getStore();
  if (!s || !args.userId) return { ms: 0, ok: false };

  const content = formatDebateMemory(args);
  const t0 = Date.now();
  try {
    await s.write({
      content,
      agentId: "twin",
      workflowId: args.userId,
      scope: "team",
      role: "observer",
    });
    const ms = Date.now() - t0;
    console.info(
      `[memory:agentmem] debate write ms=${ms} verdict=${args.verdict} chars=${content.length}`,
    );
    return { ms, ok: true };
  } catch (e) {
    const ms = Date.now() - t0;
    console.warn(
      `[memory:agentmem] debate write failed after ${ms}ms; continuing:`,
      e,
    );
    return { ms, ok: false };
  }
}
