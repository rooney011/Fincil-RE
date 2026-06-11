# Mem0 Integration Test — Fincil

**Branch:** `scratch/agentmem-test`
**Started:** 2026-06-11
**Goal:** Benchmark **Mem0** against the AgentMem baseline on Fincil's council
debate (system #1 in `BENCHMARK_TODO.md`). Hosted Mem0 via `mem0ai` MemoryClient.
**Status:** ✅ Complete. Faithful cumulative recall, stable N=3, 0 confab/0 bleed,
free for the sweep; ~15% latency tax (vs AgentMem ~8%); infer:true dedup doesn't
resolve conflicts out-of-box. See `SUMMARY.md`.

## The pluggable seam (so the benchmark is fair)

`debate.ts` is unchanged across systems. `src/lib/ai/memory.ts` is a dispatcher
selected by `MEMORY_PROVIDER`:
- `memory-types.ts` — shared types + `MemoryBackend` contract + `formatDebateMemory`
- `memory-agentmem.ts` — AgentMem backend (`MEMORY_PROVIDER=agentmem`, default)
- `memory-mem0.ts` — Mem0 backend (`MEMORY_PROVIDER=mem0`)

## Files

| File | Purpose |
|---|---|
| `01-setup.md` | Decisions, the pluggable refactor, Mem0 wire contract, env drift |
| `02-smoke-test.md` | First live run, the infer:true async footgun, the fix, faithful recall |
| `03-contradiction.md` | infer:true contradiction handling — coexists silently; drops persona opinions |
| `04-capstone.md` | N=3 stability, 0 true confab, 0 voice bleed, cumulative recall, cost sheet |
| `SUMMARY.md` | **Living** verdict + metric sheet + vs-AgentMem table (Mem0 sweep complete) |
| `live-test.mts` | 2-debate recall test (same seeds as AgentMem); writes `live-test-result.json` |
| `probe.mts` | Storage probe: infer:false vs infer:true (sync/async), filter shape |
| `contradiction-test.mts` | Conflicting-facts test; writes `contradiction-test-result.json` |
| `finish-test.mts` | N=3 capstone (mirrors AgentMem); writes `finish-test-result.json` |
| `*-result.json` | Raw outputs (reproducibility) |

## Run

```bash
# Needs MEM0_API_KEY + OPENAI_API_KEY in .env.local. Uses local node 20.
PATH=/tmp/node-v20.18.1-linux-x64/bin:$PATH \
  node --import tsx notes/mem0-test/live-test.mts

# Storage probe (why a write did/didn't land):
PATH=/tmp/node-v20.18.1-linux-x64/bin:$PATH \
  node --import tsx notes/mem0-test/probe.mts
```

The scripts self-load `.env.local` and force `MEMORY_PROVIDER=mem0` +
`FEATURE_AGENTMEM=true`, so no `--env-file` is needed (works on node 18 or 20).

## Key knobs (`.env.local`)

- `MEM0_INFER` — default **false** (verbatim write = apples-to-apples with
  AgentMem; synchronous). Set `true` to benchmark Mem0's async LLM extraction/dedup.
- `MEM0_RERANK` — default true (Mem0 server-side reranker).
- `MEM0_MIN_RELEVANCE` — default 0 (Mem0's score scale ≠ AgentMem's; don't
  transplant the 0.3 threshold).
