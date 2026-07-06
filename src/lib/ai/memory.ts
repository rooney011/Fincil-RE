/**
 * Pluggable council-memory dispatcher.
 *
 * Fincil benchmarks several memory systems behind the SAME debate flow. This
 * module selects ONE backend at runtime via the `MEMORY_PROVIDER` env var and
 * re-exports its surface, so `debate.ts` (and every other caller) is identical
 * across systems — only the backend module differs. That's what keeps the
 * benchmark apples-to-apples.
 *
 *   MEMORY_PROVIDER=agentmem   → memory-agentmem.ts   (default; old SDK)
 *   MEMORY_PROVIDER=dinomem    → memory-dinomem.ts   (live REST API; moat pillars)
 *   MEMORY_PROVIDER=mem0       → memory-mem0.ts
 *   MEMORY_PROVIDER=pgvector   → memory-pgvector.ts  (the baseline floor)
 *
 * The master on/off switch is still `FEATURE_AGENTMEM` (kept for compat — it
 * means "council memory on", regardless of provider). A backend is live only
 * when that flag is on AND the selected provider's API key is present; otherwise
 * every export is a no-op and the debate runs exactly as it did pre-memory.
 *
 * See notes/agentmem-test/ and notes/mem0-test/ for the per-system evaluations.
 */

import * as agentmem from "./memory-agentmem";
import * as dinomem from "./memory-dinomem";
import * as mem0 from "./memory-mem0";
import * as pgvector from "./memory-pgvector";
import type { MemoryBackend } from "./memory-types";

export type {
  RecallMetric,
  RecallResult,
  WriteMetric,
  DebateSnapshot,
  RecallArgs,
  RememberDebateArgs,
} from "./memory-types";

const PROVIDER = (process.env.MEMORY_PROVIDER ?? "agentmem").toLowerCase();

const backend: MemoryBackend =
  PROVIDER === "mem0"
    ? mem0
    : PROVIDER === "pgvector"
      ? pgvector
      : PROVIDER === "dinomem"
        ? dinomem
        : agentmem;

/** Which backend is active this process. */
export const memoryProvider =
  PROVIDER === "mem0"
    ? "mem0"
    : PROVIDER === "pgvector"
      ? "pgvector"
      : PROVIDER === "dinomem"
        ? "dinomem"
        : "agentmem";

/** True only when the master flag is on AND the active backend's key is present. */
export const memoryEnabled: boolean = backend.memoryEnabled;

export const recallMemories = backend.recallMemories;
export const rememberDebate = backend.rememberDebate;
