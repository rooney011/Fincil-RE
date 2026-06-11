/**
 * Mem0 backend for the council debate. Selected when MEMORY_PROVIDER=mem0.
 * Hosted Mem0 platform via the `mem0ai` MemoryClient (REST). Gated behind
 * `features.agentmem` (the shared master "memory on" switch) + MEM0_API_KEY.
 *
 * Built to MIRROR memory-agentmem.ts as closely as the two APIs allow, so the
 * Fincil benchmark compares the memory *systems*, not two different integrations:
 *
 *   AgentMem concept   →  Mem0 mapping
 *   ----------------------------------------------------------------------
 *   workflowId=user.id →  user_id   (per-user isolation, lifetime memory)
 *   agentId            →  agent_id  (persona that wrote the memory)
 *   scope:"team"       →  search filtered by user_id ONLY (not agent_id), so
 *                         every persona recalls every persona's memories for
 *                         that user — the same shared-within-user behaviour.
 *   verbatim write     →  add(..., infer) — Mem0 LLM-extracts by default; that
 *                         extraction/dedup is part of what we're benchmarking
 *                         (contradiction handling). Toggle with MEM0_INFER=false
 *                         to store verbatim instead.
 *
 * Differences worth noting in the result sheet:
 * - Mem0 returns ONE relevance `score` per hit (no separate raw-vs-rerank split
 *   like AgentMem). We map it to both `score` and `relevance`.
 * - `rerank`/`threshold` are Mem0 server-side knobs; we still gate client-side
 *   on `score >= MEM0_MIN_RELEVANCE` so the telemetry mirrors AgentMem. Default
 *   threshold is 0 (keep all top-k) — we do NOT transplant AgentMem's tuned 0.3,
 *   because Mem0's score scale differs; calibrate separately if needed.
 *
 * See notes/mem0-test/ for the evaluation log + benchmark data.
 */

import MemoryClient, { type Memory, type Message } from "mem0ai";

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

const apiKey = process.env.MEM0_API_KEY;

/** Memory is live only when the master flag is on AND a Mem0 key is present. */
export const memoryEnabled: boolean = features.agentmem && !!apiKey;

const TOP_K = 3;
/** Mem0 server-side reranker. Default ON (mirrors AgentMem's rerank-on default). */
const RECALL_RERANK = process.env.MEM0_RERANK !== "false";
/** Client-side relevance gate on Mem0's `score`. Default 0 — keep all top-k. */
const RECALL_MIN_RELEVANCE = Number.isFinite(Number(process.env.MEM0_MIN_RELEVANCE))
  ? Number(process.env.MEM0_MIN_RELEVANCE)
  : 0;
/**
 * Let Mem0 LLM-extract memories from the write. Default OFF for the main recall
 * benchmark: AgentMem stored the verdict summary VERBATIM, so `infer:false` is
 * the apples-to-apples write — and it's SYNCHRONOUS (status SUCCEEDED, instantly
 * searchable). `infer:true` is ASYNC (returns {status:"PENDING"}, extraction
 * lands seconds later) and an assistant-only recap extracts poorly. Set
 * MEM0_INFER=true to benchmark Mem0's extraction/dedup separately (contradiction
 * handling). See notes/mem0-test/02-smoke-test.md.
 */
const INFER = process.env.MEM0_INFER === "true";

let client: MemoryClient | null = null;
function getClient(): MemoryClient | null {
  if (!memoryEnabled) return null;
  if (!client) client = new MemoryClient({ apiKey: apiKey! });
  return client;
}

const scoreOf = (h: Memory): number => h.score ?? 0;

/**
 * Search this user's Mem0 memories for context relevant to the current purchase
 * and return a block of the hits that clear the relevance gate — ready to inject
 * into the task prompt. `ms` is the Mem0 search time only. No-op when memory is
 * disabled or no userId. Best-effort — a search failure is logged and swallowed.
 */
export async function recallMemories(opts: RecallArgs): Promise<RecallResult> {
  const c = getClient();
  if (!c || !opts.userId) return EMPTY_RECALL;

  const t0 = Date.now();
  try {
    // Team scope: filter by user_id ONLY (any persona's memory is recallable).
    const res = await c.search(opts.query, {
      filters: { AND: [{ user_id: opts.userId }] },
      topK: TOP_K,
      rerank: RECALL_RERANK,
    });
    const ms = Date.now() - t0;

    // output_format v1.1 → { results: [...] }; tolerate a bare array too.
    const hits: Memory[] = Array.isArray(res) ? res : (res?.results ?? []);
    const kept = hits.filter((h) => scoreOf(h) >= RECALL_MIN_RELEVANCE);
    const topRelevance = hits.length ? scoreOf(hits[0]) : null;

    console.info(
      `[memory:mem0] recall agent=${opts.agentId} ms=${ms} hits=${hits.length} kept=${kept.length} topScore=${topRelevance?.toFixed?.(4) ?? "?"} rerank=${RECALL_RERANK} (threshold ${RECALL_MIN_RELEVANCE})`,
    );

    if (!kept.length) {
      return { ...EMPTY_RECALL, ms, hitCount: hits.length, topRelevance };
    }

    const text = `${RECALL_PREFIX}\n${kept.map((h) => `- ${h.memory ?? ""}`).join("\n")}`;
    return {
      text,
      ms,
      hitCount: hits.length,
      keptCount: kept.length,
      topRelevance,
      hits: kept.map((h) => ({
        score: scoreOf(h),
        relevance: h.score ?? null,
        content: h.memory ?? "",
      })),
    };
  } catch (e) {
    const ms = Date.now() - t0;
    console.warn(`[memory:mem0] recall failed after ${ms}ms; continuing without:`, e);
    return { ...EMPTY_RECALL, ms };
  }
}

/**
 * Persist a RICH summary of a completed debate so future sessions can recall
 * something actionable (Block K parity). Written under agent_id "twin" / the
 * user's user_id so all personas recall it next time (team scope). With INFER on
 * (default) Mem0 extracts/dedupes facts from this text — capturing how it
 * resolves Miser-vs-Visionary conflicts is a benchmark goal.
 *
 * Best-effort: a failure is logged and swallowed. Returns timing for the benchmark.
 */
export async function rememberDebate(args: RememberDebateArgs): Promise<WriteMetric> {
  const c = getClient();
  if (!c || !args.userId) return { ms: 0, ok: false };

  const content = formatDebateMemory(args);
  // Framed as an assistant summary of the council's outcome. Role is constrained
  // to "user" | "assistant" by Mem0; "assistant" reads naturally for a recap.
  const messages: Message[] = [{ role: "assistant", content }];

  const t0 = Date.now();
  try {
    const res = await c.add(messages, {
      userId: args.userId,
      agentId: "twin",
      infer: INFER,
      metadata: { kind: "debate-verdict", verdict: args.verdict },
    });
    const ms = Date.now() - t0;
    // infer:false → { status:"SUCCEEDED", results:[...] } (synchronous).
    // infer:true  → { status:"PENDING", eventId } (extraction lands async).
    const r = res as unknown as { status?: string; results?: Memory[] };
    const status = r?.status ?? (Array.isArray(res) ? "SUCCEEDED" : "UNKNOWN");
    const stored: Memory[] = Array.isArray(res) ? res : (r?.results ?? []);
    const pending = status === "PENDING";
    console.info(
      `[memory:mem0] debate write ms=${ms} verdict=${args.verdict} infer=${INFER} status=${status} stored=${stored.length}${pending ? " (async — extraction lands shortly)" : ""} chars=${content.length}`,
    );
    // Accept SUCCEEDED (synchronous, stored) and PENDING (accepted, async) as ok.
    return { ms, ok: status === "SUCCEEDED" || status === "PENDING" };
  } catch (e) {
    const ms = Date.now() - t0;
    console.warn(`[memory:mem0] debate write failed after ${ms}ms; continuing:`, e);
    return { ms, ok: false };
  }
}
