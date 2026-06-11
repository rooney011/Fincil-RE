/**
 * Shared types for the pluggable council-memory layer.
 *
 * Fincil benchmarks several memory systems (AgentMem, Mem0, …) behind the SAME
 * debate code path. To keep the comparison fair, every backend implements the
 * identical surface defined here; `memory.ts` picks one at runtime via the
 * `MEMORY_PROVIDER` env var. Only the backend module changes between systems —
 * `debate.ts` never does. See notes/agentmem-test/ and notes/mem0-test/.
 */

/** Per-debate recall telemetry, surfaced to callers via `DebateInput.onRecall`. */
export type RecallMetric = {
  agentId: string;
  round: number;
  /** Milliseconds spent in the memory backend's search call alone. */
  ms: number;
  /** Hits returned by search (before any relevance filter). */
  hitCount: number;
  /** Hits that cleared the relevance threshold and were injected. */
  keptCount: number;
  /** Best relevance score among returned hits, or null. */
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

export const EMPTY_RECALL: RecallResult = {
  text: "",
  ms: 0,
  hitCount: 0,
  keptCount: 0,
  topRelevance: null,
  hits: [],
};

/** Result of a debate-memory write — `ms` is the backend write time. */
export type WriteMetric = { ms: number; ok: boolean };

/** Financial context attached to a stored debate, so recall is actionable. */
export type DebateSnapshot = {
  surplus: number;
  emiImpactPercent: number;
  safety: string;
};

export type RecallArgs = {
  agentId: string;
  userId?: string;
  query: string;
};

export type RememberDebateArgs = {
  userId?: string;
  query: string;
  amount: number;
  category?: string;
  verdict: "approved" | "rejected";
  snapshot?: DebateSnapshot;
  miserClosing?: string;
  visionaryClosing?: string;
};

/** The contract every memory backend implements (AgentMem, Mem0, …). */
export interface MemoryBackend {
  /** True only when the master flag is on AND this backend's key is present. */
  memoryEnabled: boolean;
  recallMemories(opts: RecallArgs): Promise<RecallResult>;
  rememberDebate(args: RememberDebateArgs): Promise<WriteMetric>;
}

/** Shared prompt prefix for the recalled-memory block (identical across backends). */
export const RECALL_PREFIX =
  "WHAT THE COUNCIL HAS SEEN BEFORE FROM THIS USER. If any of this is relevant " +
  "to the current decision, build on it explicitly — note what the council " +
  "decided last time and how this purchase compares. Never contradict the " +
  "current math verdict.";

/**
 * Build the rich, recallable summary of a completed debate. Identical text
 * across backends so recall quality differences reflect the *memory system*,
 * not the content we feed it. Mirrors the original AgentMem `rememberDebate`.
 */
export function formatDebateMemory(args: RememberDebateArgs): string {
  const date = new Date().toISOString().slice(0, 10);
  const cat = args.category ? ` (${args.category})` : "";
  const emi = args.snapshot
    ? Number.isFinite(args.snapshot.emiImpactPercent)
      ? `${Math.round(args.snapshot.emiImpactPercent)}% of surplus`
      : "more than the entire surplus"
    : "unknown";
  return [
    `On ${date}, the user considered: "${args.query}" — ₹${args.amount.toLocaleString("en-IN")}${cat}.`,
    `Council verdict: ${args.verdict.toUpperCase()}.`,
    args.snapshot
      ? `Financials then: monthly surplus ₹${args.snapshot.surplus.toLocaleString("en-IN")}, estimated EMI ${emi}, safety "${args.snapshot.safety}".`
      : "",
    args.miserClosing ? `The Miser's closing concern: "${args.miserClosing}"` : "",
    args.visionaryClosing ? `The Visionary's closing case: "${args.visionaryClosing}"` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
