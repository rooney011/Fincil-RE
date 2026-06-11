/**
 * pgvector baseline backend — the "floor" in the memory-systems benchmark.
 * Selected when MEMORY_PROVIDER=pgvector. Plain Supabase pgvector table +
 * cosine top-k. No extraction, no dedup, no rerank — just store the verbatim
 * debate summary, embed it, and retrieve by cosine similarity.
 *
 * Reuses Fincil's OWN stack so this is the honest "build it yourself" baseline:
 * - embeddings: gemini-embedding-001 @ 768 dims (src/lib/ai/embeddings.ts)
 * - storage/search: public.council_memories + match_council_memories RPC
 *   (supabase/migrations/20260611000000_council_memories.sql)
 *
 * Parity with the managed systems:
 * - workflowId/user_id → council_memories.user_id (per-user isolation)
 * - agentId → agent_id (persona that wrote it; "twin" for verdicts)
 * - scope:"team" → RPC filters by user_id only, so every persona recalls every
 *   persona's memories for that user
 * - same verbatim write text (formatDebateMemory), same topK=3, once-per-debate.
 *
 * Gated behind `features.agentmem` (master memory switch) + Supabase service
 * creds. No extra API key — reuses SUPABASE_SERVICE_ROLE_KEY + the Gemini key.
 *
 * See notes/pgvector-test/ for the evaluation log + benchmark data.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { features } from "@/lib/env";
import { embedDocument, embedQuery } from "./embeddings";
import {
  EMPTY_RECALL,
  RECALL_PREFIX,
  formatDebateMemory,
  type RecallArgs,
  type RecallResult,
  type RememberDebateArgs,
  type WriteMetric,
} from "./memory-types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Live only when the master flag is on AND Supabase service creds are present. */
export const memoryEnabled: boolean = features.agentmem && !!url && !!serviceKey;

const TOP_K = 3;
/** Cosine-similarity floor (0–1). Default 0 — keep top-k (mirrors Mem0's default). */
const MIN_SIMILARITY = Number.isFinite(Number(process.env.PGVECTOR_MIN_SIMILARITY))
  ? Number(process.env.PGVECTOR_MIN_SIMILARITY)
  : 0;

let client: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
  if (!memoryEnabled) return null;
  if (!client) client = createClient(url!, serviceKey!, { auth: { persistSession: false } });
  return client;
}

type MatchRow = { id: string; agent_id: string; content: string; created_at: string; similarity: number };

/**
 * Embed the query (Gemini) and cosine-search council_memories via the RPC.
 * `ms` covers embed + RPC (both are part of pgvector's real recall cost); the
 * split is logged. No-op when disabled or no userId. Best-effort.
 */
export async function recallMemories(opts: RecallArgs): Promise<RecallResult> {
  const c = getClient();
  if (!c || !opts.userId) return EMPTY_RECALL;

  const t0 = Date.now();
  try {
    const tEmbed = Date.now();
    const queryEmbedding = await embedQuery(opts.query);
    const embedMs = Date.now() - tEmbed;

    const tRpc = Date.now();
    const { data, error } = await c.rpc("match_council_memories", {
      query_embedding: queryEmbedding,
      match_threshold: MIN_SIMILARITY,
      match_count: TOP_K,
      filter_user_id: opts.userId,
    });
    const rpcMs = Date.now() - tRpc;
    const ms = Date.now() - t0;

    if (error) {
      console.warn(`[memory:pgvector] recall RPC error after ${ms}ms; continuing:`, error.message);
      return { ...EMPTY_RECALL, ms };
    }

    const hits = (data ?? []) as MatchRow[];
    const topRelevance = hits.length ? hits[0].similarity : null;
    console.info(
      `[memory:pgvector] recall agent=${opts.agentId} ms=${ms} (embed ${embedMs} + rpc ${rpcMs}) hits=${hits.length} topSim=${topRelevance?.toFixed?.(4) ?? "?"} (threshold ${MIN_SIMILARITY})`,
    );

    if (!hits.length) return { ...EMPTY_RECALL, ms, hitCount: 0, topRelevance };

    const text = `${RECALL_PREFIX}\n${hits.map((h) => `- ${h.content}`).join("\n")}`;
    return {
      text,
      ms,
      hitCount: hits.length,
      keptCount: hits.length,
      topRelevance,
      hits: hits.map((h) => ({ score: h.similarity, relevance: h.similarity, content: h.content })),
    };
  } catch (e) {
    const ms = Date.now() - t0;
    console.warn(`[memory:pgvector] recall failed after ${ms}ms; continuing without:`, e);
    return { ...EMPTY_RECALL, ms };
  }
}

/**
 * Embed (Gemini) + insert the verbatim debate summary into council_memories.
 * `ms` covers embed + insert. Best-effort; returns timing for the benchmark.
 */
export async function rememberDebate(args: RememberDebateArgs): Promise<WriteMetric> {
  const c = getClient();
  if (!c || !args.userId) return { ms: 0, ok: false };

  const content = formatDebateMemory(args);
  const t0 = Date.now();
  try {
    const embedding = await embedDocument(content);
    const { error } = await c.from("council_memories").insert({
      user_id: args.userId,
      agent_id: "twin",
      content,
      embedding,
    });
    const ms = Date.now() - t0;
    if (error) {
      console.warn(`[memory:pgvector] debate write error after ${ms}ms; continuing:`, error.message);
      return { ms, ok: false };
    }
    console.info(`[memory:pgvector] debate write ms=${ms} verdict=${args.verdict} chars=${content.length}`);
    return { ms, ok: true };
  } catch (e) {
    const ms = Date.now() - t0;
    console.warn(`[memory:pgvector] debate write failed after ${ms}ms; continuing:`, e);
    return { ms, ok: false };
  }
}
