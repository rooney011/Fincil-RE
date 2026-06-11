# pgvector Baseline Test — Fincil

**Branch:** `scratch/agentmem-test`
**Started/completed:** 2026-06-11
**Goal:** The baseline FLOOR (BENCHMARK_TODO #2) — plain pgvector table + cosine
top-k, no extraction/dedup/rerank. Does any managed system beat raw vector search?
**Status:** ✅ Complete. Floor matches the managed systems on recall faithfulness/
safety, with the lowest latency (~5.2% tax) and $0 marginal cost. See `SUMMARY.md`.

## Files

| File | Purpose |
|---|---|
| `01-setup.md` | Design, migration, parity mapping, infra/toolchain gotchas |
| `02-results.md` | Live + N=3 capstone results + the 3-way comparison table |
| `SUMMARY.md` | Metric sheet + verdict + caveats |
| `live-test.mts` | 2-debate recall test (same seeds as Mem0/AgentMem) |
| `finish-test.mts` | N=3 capstone (stability + confab + voice bleed) |
| `*-result.json` | Raw outputs |

The backend is `src/lib/ai/memory-pgvector.ts`; the table/RPC are in
`supabase/migrations/20260611000000_council_memories.sql`.

## Run

```bash
# Needs the migration applied + an un-paused Supabase project.
# Supabase host isn't allowlisted in the Bash sandbox → run with sandbox disabled.
# @supabase/supabase-js needs node >=22 (global WebSocket).
PATH=/tmp/node-v22.11.0-linux-x64/bin:$PATH node --import tsx notes/pgvector-test/live-test.mts
PATH=/tmp/node-v22.11.0-linux-x64/bin:$PATH node --import tsx notes/pgvector-test/finish-test.mts
```

Knob: `PGVECTOR_MIN_SIMILARITY` (cosine floor 0–1, default 0 = keep top-k).
