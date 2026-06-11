# Mem0 — Iteration 01: Setup & Integration

**Date:** 2026-06-11
**Branch:** `scratch/agentmem-test`
**Goal:** Benchmark **Mem0** against the AgentMem baseline on the Fincil council
debate, per `BENCHMARK_TODO.md` (system #1, the category-leader head-to-head).

## Decisions (from the user)

1. **Access: hosted free tier.** Use the `mem0ai` `MemoryClient` (REST against
   the Mem0 platform) + `MEM0_API_KEY`. Rationale: truest out-of-box Mem0,
   mirrors hosted AgentMem, uses Mem0's default extraction + embeddings → the
   fairest apples-to-apples comparison. (OSS self-host was the alternative.)
2. **Run env: in-sandbox.** Recreate node_modules on Linux + run here, rather
   than hand the scripts back to run on the user's machine.

## What got built — a pluggable memory backend

To keep the benchmark fair, the debate flow must be **byte-identical** across
systems; only the memory backend swaps. So `src/lib/ai/memory.ts` became a
dispatcher selected by `MEMORY_PROVIDER`:

| File | Role |
|---|---|
| `src/lib/ai/memory-types.ts` | **NEW** — shared types + the `MemoryBackend` contract + `RECALL_PREFIX` + `formatDebateMemory()` (the identical write text both backends store). |
| `src/lib/ai/memory-agentmem.ts` | **NEW** — the original AgentMem impl, moved verbatim (now imports shared types). `MEMORY_PROVIDER=agentmem` (default). |
| `src/lib/ai/memory-mem0.ts` | **NEW** — Mem0 backend, same surface. `MEMORY_PROVIDER=mem0`. |
| `src/lib/ai/memory.ts` | Now a thin dispatcher: picks a backend by env, re-exports `memoryEnabled` / `recallMemories` / `rememberDebate` + types. Adds `memoryProvider`. |
| `src/lib/env.ts` | Added optional `MEM0_API_KEY`. |
| `.env.example` | Documented `MEMORY_PROVIDER`, `MEM0_API_KEY`, and the Mem0 knobs. |

`debate.ts` is **unchanged** — it still imports `recallMemories`/`rememberDebate`
from `./memory`. That's the whole point: identical debate, swappable memory.

## AgentMem → Mem0 mapping (how parity is preserved)

| AgentMem concept | Mem0 mapping |
|---|---|
| `workflowId = user.id` | `user_id` (per-user, lifetime memory) |
| `agentId` ("twin"/…) | `agent_id` |
| `scope: "team"` | search filtered by `user_id` **only** (not `agent_id`) → every persona recalls every persona's memories for that user |
| verbatim write | `add(messages, { infer })` — Mem0 LLM-extracts by default; `MEM0_INFER=false` stores verbatim. Extraction/dedup is part of what we're benchmarking. |
| `topK = 3`, once-per-debate recall | identical (recall cadence lives in `debate.ts`, shared) |

### Mem0 wire contract (from `node_modules/mem0ai` v3.0.7)

- `MemoryClient` is the default export; `new MemoryClient({ apiKey })`.
- `add(messages, opts)` → `POST /v3/memories/add/`, body `{messages, user_id, agent_id, infer, metadata}` (camel→snake conversion is automatic). Returns the extracted `Memory[]`.
- `search(query, opts)` → `POST /v3/memories/search/`, `output_format: "v1.1"`. **Rejects top-level entity params** (`userId`/`agentId`) — scoping MUST go through `filters`. We use `filters: { AND: [{ user_id }] }`. Returns `{ results: Memory[] }`, each with `memory` (text) + `score` (relevance).
- One relevance `score` per hit (no raw-vs-rerank split like AgentMem); we map it to both `score` and `relevance` in telemetry.

## Environment notes (drift found)

- `node_modules` was originally installed on **Windows** with **pnpm 10.21.0**
  (`.modules.yaml`: `storeDir: D:\.pnpm-store\v10`, `virtualStoreDirMaxLength: 60`).
- Recreated on Linux with: `CI=true npx pnpm@10.21.0 install --no-frozen-lockfile --config.virtual-store-dir-max-length=60` (≈7m40s). `CI=true` is required to wipe the modules dir non-interactively.
- This box ships **node 18.19.1**, but vitest 4 (rolldown → `node:util.styleText`) and the app runtime need **node ≥20**. Pulled a local node 20.18.1 to `/tmp/node-v20.18.1-linux-x64/` and run the scripts with it.
- `vitest run` still fails here — rolldown's native binding (`@rolldown/binding-linux-x64-gnu`) wasn't set up because pnpm's build scripts are in `ignoredBuiltDependencies`. **Typecheck passes** (`tsc --noEmit`), which already validates the refactor's type integrity; the unit suite is an independent tooling gap, not a regression. `tsx` (esbuild) runs fine, so the live benchmark scripts work.

## Verification so far

- `tsc --noEmit` → **clean** (refactor + Mem0 backend typecheck).
- `node --import tsx notes/mem0-test/live-test.mts` → loads end to end, selects
  the Mem0 backend (`memoryProvider: mem0`), aborts cleanly with
  `memoryEnabled: false` because no `MEM0_API_KEY` is set yet. Tooling is good.

## Blocker → next step

The only thing standing between here and a live run is a **Mem0 API key**.

1. Create a hosted Mem0 key at https://app.mem0.ai (free tier).
2. Add to `.env.local`: `MEM0_API_KEY=m0-...`
3. Run the live test:
   ```bash
   PATH=/tmp/node-v20.18.1-linux-x64/bin:$PATH \
     node --import tsx notes/mem0-test/live-test.mts
   ```
   (The script forces `MEMORY_PROVIDER=mem0` + `FEATURE_AGENTMEM=true` and
   self-loads `.env.local`, so no `--env-file` is needed.)
4. Record results into `02-smoke-test.md` + the metric sheet in `SUMMARY.md`,
   mirroring the AgentMem iteration files.
