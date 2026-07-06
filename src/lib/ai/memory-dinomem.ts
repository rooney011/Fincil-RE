/**
 * DinoMem backend for the council debate. Selected when MEMORY_PROVIDER=dinomem.
 *
 * Calls the DinoMem REST API directly (plain fetch) — no SDK. The old
 * @agentmem/sdk 0.8 lacks factKey/validFrom, and we want to exercise the full
 * moat surface. Gated behind `features.agentmem` (the shared "memory on" switch)
 * + DINOMEM_API_KEY.
 *
 * Moat pillar mapping for Fincil:
 *   P1 (bi-temporal)  — factKey per purchase topic is versioned: a later debate
 *                        about the same purchase supersedes the earlier verdict.
 *                        History stays queryable via GET /v1/memory/:id/history.
 *   P2 (receipts)     — every search generates an immutable receipt recording
 *                        which persona read which user's memory.
 *                        Verify in GET /v1/receipts or the DinoMem dashboard.
 *   P0 (conflicts)    — exercised in the live-test moat section: write the same
 *                        factKey from multiple agentIds → GET /v1/crdt/conflicts.
 *                        Not triggered by the production recall path (single writer).
 *
 * Per-user isolation: `workflowId: userId` — the search endpoint filters strictly
 * by workflowId, so each user sees only their own debate memories even within a
 * shared org API key. (factKeyPrefix filter is not yet live on the API surface.)
 *
 * Design mirrors memory-agentmem.ts so the benchmark is apples-to-apples:
 *   - Same workflowId = userId, agentId = persona name, scope = "team"
 *   - Same once-per-debate recall cadence (called from debate.ts, not per-turn)
 *   - Same formatDebateMemory content (verbatim, no extraction)
 *   - Rerank ON by default; DINOMEM_RERANK=false to skip; threshold 0.3
 *
 * API base: https://lwbwcuuzoituanwhekyo.supabase.co/functions/v1/api
 * See notes/dinomem-test/ for the evaluation log + benchmark data.
 */

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

const API_KEY = process.env.DINOMEM_API_KEY;
const BASE_URL =
  process.env.DINOMEM_BASE_URL ??
  "https://lwbwcuuzoituanwhekyo.supabase.co/functions/v1/api";

/** Memory is live only when the master flag is on AND a DinoMem key is present. */
export const memoryEnabled: boolean = features.agentmem && !!API_KEY;

/** Rerank ON by default (same as agentmem). Set DINOMEM_RERANK=false to skip. */
const RECALL_RERANK = process.env.DINOMEM_RERANK !== "false";

/**
 * Relevance threshold. DinoMem's calibrated relevance score after rerank:
 *   near-exact ≈ 1.0, related ≈ 0.7, same-category ≈ 0.1, unrelated ≈ 0.016.
 * Default 0.3 — same as agentmem (recalibrate in live-test if score scale differs).
 */
const RECALL_MIN_RELEVANCE = Number.isFinite(
  Number(process.env.DINOMEM_MIN_RELEVANCE),
)
  ? Number(process.env.DINOMEM_MIN_RELEVANCE)
  : 0.3;

type DinoMemSearchHit = {
  id: string;
  content: string;
  score: number;
  relevance_score?: number;
  agent_id?: string;
  workflow_id?: string;
  fact_key?: string;
  created_at?: string;
};

type DinoMemWriteResponse = {
  writeId: string;
  conflictsChecked?: boolean;
  embeddingPending?: boolean;
};

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DinoMem ${path} → ${res.status}: ${text}`);
  }
  return res.json() as T;
}

/** Stable slug from the purchase query — used as the factKey's topic segment. */
function slugify(q: string): string {
  return q
    .toLowerCase()
    .replace(/[₹₽$€£¥]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40)
    .replace(/-+$/, "");
}

/**
 * Search this user's DinoMem memories for context relevant to the current
 * purchase. workflowId = userId ensures per-user isolation. Reranks + gates on
 * relevance_score. Returns a formatted block ready for the task prompt, plus
 * instrumentation for the benchmark. No-op when memory is disabled or no userId.
 * Best-effort — a search failure is logged and swallowed.
 */
export async function recallMemories(opts: RecallArgs): Promise<RecallResult> {
  if (!memoryEnabled || !opts.userId) return EMPTY_RECALL;

  const t0 = Date.now();
  try {
    const raw = await apiPost<DinoMemSearchHit[]>("/v1/memory/search", {
      query: opts.query,
      agentId: `fincil-${opts.agentId}`,
      workflowId: opts.userId,
      topK: 3,
      rerank: RECALL_RERANK,
    });

    const ms = Date.now() - t0;
    const hits = Array.isArray(raw) ? raw : [];

    const rel = (h: DinoMemSearchHit) =>
      h.relevance_score ?? h.score ?? 0;

    const kept = hits.filter((h) => rel(h) >= RECALL_MIN_RELEVANCE);
    const topRelevance = hits.length ? rel(hits[0]) : null;

    // Detect silent rerank degradation (relevance collapses to raw score ≈ 0.016).
    const reranked = hits.some(
      (h) =>
        h.relevance_score != null &&
        Math.abs(h.relevance_score - (h.score ?? 0)) > 1e-6,
    );
    if (RECALL_RERANK && hits.length && !reranked) {
      console.warn(
        `[memory:dinomem] rerank appears unavailable (relevance==raw, ~${topRelevance?.toFixed?.(3)}); recall conservatively injecting nothing despite ${hits.length} stored hit(s)`,
      );
    }

    console.info(
      `[memory:dinomem] recall agent=fincil-${opts.agentId} ms=${ms} hits=${hits.length} kept=${kept.length} topRel=${topRelevance?.toFixed?.(4) ?? "?"} reranked=${reranked} (threshold ${RECALL_MIN_RELEVANCE})`,
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
      `[memory:dinomem] recall failed after ${ms}ms; continuing without:`,
      e,
    );
    return { ...EMPTY_RECALL, ms };
  }
}

/**
 * Persist a RICH summary of a completed debate (verdict + finance snapshot +
 * each persona's closing argument) so future sessions can recall something
 * actionable. Written as agentId "fincil-twin" with factKey namespaced under
 * the purchase topic — exercises P1 bi-temporal (supersedes on re-debate).
 * Best-effort. Returns timing for the benchmark.
 */
export async function rememberDebate(
  args: RememberDebateArgs,
): Promise<WriteMetric> {
  if (!memoryEnabled || !args.userId) return { ms: 0, ok: false };

  const content = formatDebateMemory(args);
  const factKey = `fincil.purchase.${slugify(args.query)}`;

  const t0 = Date.now();
  try {
    const res = await apiPost<DinoMemWriteResponse>("/v1/memory/write", {
      content,
      agentId: "fincil-twin",
      workflowId: args.userId,
      scope: "team",
      factKey,
    });
    const ms = Date.now() - t0;
    console.info(
      `[memory:dinomem] debate write ms=${ms} verdict=${args.verdict} factKey=${factKey} writeId=${res.writeId} conflictsChecked=${res.conflictsChecked} embeddingPending=${res.embeddingPending} chars=${content.length}`,
    );
    return { ms, ok: !!res.writeId };
  } catch (e) {
    const ms = Date.now() - t0;
    console.warn(
      `[memory:dinomem] debate write failed after ${ms}ms; continuing:`,
      e,
    );
    return { ms, ok: false };
  }
}
