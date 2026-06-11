# pgvector — Iteration 02: Live + N=3 capstone results

**Date:** 2026-06-11
**Scripts:** `live-test.mts`, `finish-test.mts`
**Raw:** `live-test-result.json`, `finish-test-result.json`
**Config:** verbatim write, cosine top-k, `PGVECTOR_MIN_SIMILARITY=0`.
**Infra:** Supabase project was paused → user restored it + applied the migration.
Runs use local node 22 with the Bash sandbox disabled (Supabase host not allowlisted).

## Live (2 debates)

```
Debate 1 (seed, cold): recall 1181ms (embed 567 + rpc 614), 0 hits | write 1363ms
Debate 2 (recall):     recall  565ms (embed 494 + rpc  71!), 1 hit, topSim 0.6919, injected 1254 chars
                       write 949ms, verdict rejected (math-correct)
```

Debate 2 referenced the prior decision every turn, faithfully:
- *"Last time, you aimed for an ₹80,000 laptop with a 20% EMI impact; that was a safer path."*
- *"last time we approved an ₹80,000 laptop because it positioned you for better earnings."*

The ₹80k/20% matches the stored memory (no confabulation). **Note the warm RPC is
~70ms** — recall latency is dominated by the Gemini embed (~500ms), not the DB.

## Stability (N=3 capstone)

| | run 1 | run 2 | run 3 | mean | p50 |
|---|---|---|---|---|---|
| recall ms | 591 | 547 | 496 | **545** | 547 |
| write ms | 938 | 1221 | 1283 | **1147** | 1221 |
| wall ms | 28807 | 29259 | 40403 | **32823** | 29259 |

**Memory tax ≈ 1.7s/debate (recall ~0.55s + write ~1.15s) ≈ 5.2% of a ~33s debate.**
Recall is dominated by the Gemini embedding call; the cosine RPC is ~50–70ms.

- **Confabulation: 0 TRUE** (6 flagged = the same harness false-positive seen in
  Mem0 iter 04). Recall `kept` grew 1→2→3 as memory accumulated; by debate 3 the
  ₹1,20,000 rejections from debates 1–2 are legitimately stored. Verified via direct
  query: 4 memories stored, the verbatim ₹1,20,000 rejections present. The Miser's
  *"Last time, the council rejected a similar ₹1,20,000 purchase"* is accurate recall.
- **Voice bleed: 0.**
- **Cumulative faithful recall** confirmed (cites both the ₹80k approval and the
  ₹1,20,000 rejections, right personas, right voices).

## Cost

**$0 marginal** — pgvector lives in Fincil's existing Supabase project; storage +
the cosine query are part of the DB you already pay for (free tier here). The only
per-op cost is the **Gemini embedding** call on each write + recall
(gemini-embedding-001), which Fincil already uses for transactions — negligible and
shared with the rest of the app. No managed memory service, no per-memory fee.

## The headline finding — the floor matches the managed systems

| metric (N=3) | AgentMem | Mem0 (infer:false) | **pgvector** |
|---|---|---|---|
| recall ms | ~1100 | 2474 | **545** |
| write ms | ~1800 | 2710 | **1147** |
| memory tax | ~8% | ~15% | **~5.2%** |
| recall faithful + cumulative | ✅ | ✅ | ✅ |
| true confabulation | 0 | 0 | 0 |
| voice bleed (N=3) | 0 | 0 | 0 |
| relevance signal | rerank (silent-degrade) | score 0.78–0.88 | cosine sim 0.69–0.71 |
| contradiction dedup | not tested | ❌ coexist (async) | n/a (no dedup) |
| cost | $ never pinned | free→$3.80/1k debates | **$0 marginal** |
| infra | hosted service | hosted service | **one table** |

> **On Fincil's debate workload, the raw pgvector floor is faithful, safe, the
> fastest, and effectively free.** The managed systems' differentiators don't add
> recall value here: AgentMem's rerank gating degrades silently; Mem0's
> extraction/dedup is async, drops persona opinions, and doesn't resolve
> contradictions (iter 03). For this app, a table + cosine top-k is the right call.

## Fair caveats (where the managed systems could still win)

- **Scale.** These scenarios store a handful of memories per user. pgvector keeps
  all top-k (threshold 0); with hundreds of noisy memories, managed relevance
  filtering / extraction / decay might matter — Fincil's flow just doesn't stress it.
- **No dedup.** pgvector accumulates verbatim rows; over a long user history that
  grows unbounded (a `latestOnly`/decay story the managed systems have). Not a
  problem at Fincil's scale, but a real difference at volume.
- **Embeddings.** pgvector uses Gemini (Fincil's choice); the managed systems use
  their own defaults. Recall-quality parity here is partly "good embedding + small
  corpus." The benchmark deliberately keeps embeddings each system's default.

The floor's win is a statement about **this workload/scale**, not a universal claim —
exactly what the baseline is for (BENCHMARK_TODO: "if a system can't beat this on
Fincil, that scenario isn't measuring memory value").
