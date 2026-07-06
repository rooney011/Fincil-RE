# DinoMem integration test — Fincil

**Status:** ✅ Complete (2026-07-05)
**Branch:** main (wired alongside agentmem/mem0/pgvector)

DinoMem (the product that evolved from AgentMem) benchmarked in Fincil using
the live REST API (`fetch` only; no SDK). Exercises all three moat pillars:
P0 CRDT conflict detection, P1 bi-temporal factKey versioning, P2 receipts.

## Files

| File | What |
|---|---|
| `01-setup.md` | Discovery: workflowId isolation, response shapes, env setup |
| `02-integration.md` | Adapter design decisions, factKey strategy, parity notes |
| `live-test.mts` | Full live test: 3-debate recall sweep + P0/P1/P2 moat sections |
| `live-test-result.json` | Raw test output |
| `SUMMARY.md` | Benchmark metrics, 4-way comparison, moat findings, recommendation |

## How to run

```bash
# From fincil-remastered/:
node --env-file=.env.local --import tsx notes/dinomem-test/live-test.mts
```

Requires `.env.local`:
```
DINOMEM_API_KEY=sk-...   (or alias from AGENTMEM_API_KEY)
FEATURE_AGENTMEM=true
OPENAI_API_KEY=sk-...
GOOGLE_GENERATIVE_AI_API_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Key findings (see SUMMARY.md for full detail)

- Recall faithful: D2 council cited the prior ₹80k approval every round
- Memory tax: ~15% (~6.2s/debate) — rerank dominates at ~4s/call
- 0 confabulation, 0 voice bleed
- P1 factKey versioning working (same-topic debates would supersede)
- P2 receipts generated on every search (8 in this run)
- P0 conflicts: auto-resolved by default policy; `human_in_loop` needed for open conflicts
- workflowId = correct per-user isolation (factKeyPrefix not filtering on live prod)
