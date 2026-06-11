# Mem0 — Iteration 04: Capstone (N=3 stability, confabulation, voice bleed) + cost

**Date:** 2026-06-11
**Script:** `notes/mem0-test/finish-test.mts` (mirrors AgentMem's `finish-test.mts`)
**Raw:** `notes/mem0-test/finish-test-result.json`
**Config:** `infer:false` (verbatim), rerank on, `MEM0_MIN_RELEVANCE=0` (default).

Seed (₹80,000) + 3 recall debates, same queries/seeds as AgentMem's Block L/J.

## Stability (N=3)

| | run 1 | run 2 | run 3 | mean | p50 |
|---|---|---|---|---|---|
| recall ms | 2248 | 2260 | 2913 | **2474** | 2260 |
| write ms | 2882 | 2658 | 2589 | **2710** | 2658 |
| wall ms | 33983 | 34412 | 36147 | **34847** | 34412 |

**Memory tax ≈ 5.2s/debate (recall ~2.5s + write ~2.7s) ≈ ~15% of a ~35s debate.**
(Single-run iter 02 saw ~11–13% on a longer ~45s debate; absolute tax ~5s is
consistent — the % just tracks how long OpenAI takes.) Tight variance across runs.

> vs AgentMem (Block L): recall ~1.1s, write ~1.8s, ~8% tax. **Mem0's recall
> (~2.5s) is ~2× AgentMem's (~1.1s); its write (~2.7s) ~1.5×.** Mem0 carries a
> meaningfully higher memory tax on this workload, though still a few seconds on a
> ~35s debate.

## Confabulation: 0 TRUE (5 flagged = harness false positives)

The heuristic flagged 5 `₹1,20,000` amounts in recall-debate 3. **All are faithful**,
not invented:
- The harness snapshots "allowed amounts" ONCE after the seed. But Mem0's memory
  **accumulates** across the N=3 loop — recall `kept` grew **1 → 2 → 3** as each
  debate wrote its verdict. By debate 3, memory holds the seed ₹80k approval **and**
  the ₹1,20,000 rejections from debates 1–2.
- Verified via `getAll` on the run's user_id: the stored memories explicitly
  contain *"considered … ₹1,20,000 … Council verdict: REJECTED"* (×2). So the
  Miser's *"Last time, we rejected a ₹1,20,000 laptop for similar financial
  strain"* is **accurate recall**.

**True confabulation = 0** (same as AgentMem). The flags are a known limitation of
the test's static baseline, not a Mem0 fault.

### Bonus finding — cumulative faithful recall
By debate 3 the council accurately cited BOTH the ₹80,000 approval and the
₹1,20,000 rejections, in the right personas' voices. Mem0's recall is genuinely
cumulative across sessions and stayed faithful as memory grew — exactly the
cross-session continuity Fincil wants.

## Voice bleed: 0

Zero history-claim lines where a persona borrowed the other's vocabulary. Team
scope (search filtered by user_id only) lets both personas reference shared
history, each in its own voice. Matches AgentMem (0 bleed).

## Cost

Mem0 hosted pricing (fetched 2026-06-11 from mem0.ai/pricing):

| Tier | $/mo | add reqs/mo | retrieval reqs/mo |
|---|---|---|---|
| **Free (Hobby)** | $0 | 10,000 | **1,000** |
| Starter | $19 | 50,000 | 5,000 |
| Growth | $79 | 200,000 | 20,000 |
| Pro | $249 | 500,000 | 50,000 |

**Per Fincil debate = 1 search (retrieval) + 1 write (add).** Retrievals are the
binding limit (you write more than you search? no — 1:1 here, but retrievals are
the scarcer quota):
- **Free tier covers ~1,000 debates/month** (retrieval-bound). The whole benchmark
  sweep (a few dozen debates) is comfortably free.
- Cheapest paid (Starter): 5,000 retrievals / $19 → **~$3.80 per 1,000 debates**
  (retrieval-bound; adds are abundant). Per debate ≈ **$0.0038**.

Notes:
- With **`infer:false`** there is **no Mem0-side extraction-LLM cost to us** — the
  write is verbatim; embeddings + storage are included in the platform price.
  (`infer:true` would add server-side extraction, still billed as 1 add request.)
- The debate's own **gpt-4o-mini** cost is shared across ALL benchmarked systems
  and is **not attributable to the memory layer** — excluded from this comparison.
- AgentMem's $ cost was never pinned in its notes (framed as latency + its own
  extraction calls), so a direct $-for-$ line isn't available; Mem0's platform
  cost above is the concrete number.

## Net

Mem0 passes the capstone: **stable** (tight N=3), **0 true confabulation**,
**0 voice bleed**, **cumulative faithful recall**, and **free for the benchmark**
(~$3.80/1k debates if scaled on the cheapest paid tier). Its one real cost vs
AgentMem is **latency** — ~2× the recall time, ~15% vs ~8% memory tax.
