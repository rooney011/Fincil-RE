# pgvector Integration — Summary & Verdict

**Branch:** `scratch/agentmem-test`
**Last updated:** 2026-06-11 (complete)
**Status:** ✅ Complete. The baseline floor recalls as faithfully as the managed
systems, with the **lowest latency and zero marginal cost** on Fincil's workload.

---

## TL;DR

A plain `council_memories` table + cosine top-k (no extraction, no dedup, no
rerank), reusing Fincil's own gemini-768 embeddings, drops in behind the same
`MEMORY_PROVIDER` seam. It gives the council **faithful, cumulative cross-session
recall** — the council cites past approvals/rejections accurately, every turn —
at **~5.2% latency tax** (recall ~0.55s, write ~1.15s), 0 true confabulation, 0
voice bleed, and **$0 marginal cost**.

On this workload it **matches or beats** both managed systems. See
`02-results.md` for the full 3-way table.

---

## Metric sheet

```
System:            pgvector (Supabase) baseline floor   Version: pgvector on Supabase
Access:            🟢 FREE (Fincil's own Supabase; no new service/key)
Embeddings/LLM:    gemini-embedding-001 @ 768 (Fincil's own); debate LLM gpt-4o-mini
Recall quality:    ✅ faithful + cumulative; cites ₹80k approval AND ₹1.2L rejections
                   accurately. topSim 0.69–0.71. 0 true confabulation.
Latency/debate:    N=3: recall mean 545ms (embed ~500 + rpc ~60), write mean 1147ms,
                   wall mean 32823ms. Memory tax ~1.7s ≈ ~5.2% — lowest of the three.
Cost:              $0 marginal (storage + cosine query in the existing Supabase;
                   only per-op cost is the Gemini embed Fincil already makes).
Contradiction:     n/a — no dedup. Verbatim rows accumulate (fine at Fincil scale;
                   would grow unbounded over a long history — no latestOnly/decay).
Voice bleed (N=3): 0
DX notes:          One migration (council_memories + match_council_memories RPC) +
                   one backend file. Reuses existing embeddings + service client.
                   Footguns: service role can't run DDL (apply migration manually);
                   @supabase/supabase-js createClient needs node ≥22 (global WebSocket).
Failures/quirks:   Supabase free project had auto-paused (host stopped resolving) —
                   needed a restore. No runtime quirks once up.
Raw outputs:       notes/pgvector-test/live-test-result.json, finish-test-result.json
```

---

## Verdict

**The floor wins on Fincil.** Faithful cumulative recall, fastest, cheapest,
simplest. The managed systems' differentiators don't pay off for this debate
workload: AgentMem's rerank gating degrades silently under load; Mem0's
extraction/dedup is async, drops the persona arguments, and doesn't resolve
contradictions out-of-box.

**Caveat (honest):** this reflects Fincil's **scale** — a handful of memories per
user, clean recall. At hundreds of noisy memories the managed systems' relevance
filtering / extraction / decay could earn their keep; Fincil's flow doesn't stress
that. The baseline's job is exactly to expose this: if a managed system can't beat
a table + cosine here, the scenario isn't measuring memory value (it's measuring
"good embedding + small corpus"). The richer `agentmem-bench` S1–S7 synthetic
harness is where the at-scale / contradiction / temporal dimensions get stressed.

## Implication for the benchmark

For **Fincil specifically**, pgvector is the pragmatic choice. The managed systems
need a harder workload (more memories, contradictions, temporal validity) to show
their value — which is the motivation for running the same systems through the
synthetic S1–S7 harness next, rather than more app-level scenarios.
