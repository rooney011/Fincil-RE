# Iteration 06 — Block I: rerank + relevance threshold

**Date:** 2026-05-20

## Goal

Only inject memory the reranker rates as genuinely relevant, so unrelated/cold
debates don't get noise. Requires `rerank:true` because the raw hybrid `score`
can't discriminate (related and unrelated both sit ~0.016).

## Step 1 — calibrate the threshold (`calibrate-relevance.mts`)

Seeded one laptop debate memory, then ran rerank searches across a battery of
queries:

| Query | kind | relevance_score |
|---|---|---|
| "buy a new laptop for freelance work" | near-exact | **1.00** |
| "upgrade to a more powerful laptop" | related (Block K case) | **0.70** |
| "buy a mechanical keyboard" | same category | 0.10 |
| "buy an ergonomic office chair" | diff category | 0.016 |
| "book a vacation to Goa" | unrelated | 0.016 |
| "concert tickets this weekend" | unrelated | 0.016 |
| "invest in a mutual fund SIP" | unrelated | 0.016 |

Clean gap: keep band 0.7–1.0, drop band ≤0.1. **Threshold = 0.3** keeps related,
drops same-category and unrelated, with margin on both sides. Note: when rerank
finds nothing relevant, `relevance_score` falls back to the raw score (~0.016).

## Step 2 — implement (`src/lib/ai/memory.ts`)

`recallMemories` now passes `rerank:true` and keeps only hits with
`relevance_score >= 0.3`. `RecallResult`/`RecallMetric` gained `keptCount` +
`topRelevance` (replacing the meaningless raw `topScore`).

## Step 3 — verify

**Related (live test):** debate 2 → `hits=1 kept=1 topRel=0.70`, 1167 chars
injected, Miser used it ("Last time, a ₹7,000 EMI felt dangerously close…").
Block K behavior preserved. Recall latency rose to ~6.7 s (rerank cost), once
per debate.

**Cold start:** debate 1 (empty store) → `hits=0 kept=0`, no rerank cost.

## Step 4 — THE FINDING: rerank degrades silently under load

When I probed unrelated queries (`block-i-drop-test.mts`), the *related* query
suddenly returned `relevance=0.030` (= raw) and was dropped — contradicting the
0.70 it scored minutes earlier. `rerank-stability.mts` (same query ×5, then
again after a 40 s pause) confirmed it:

```
run 1..5:  ~1–3s, relevance=[0.030, 0.016]   ← raw scores, NO rerank lift
(after 40s pause) run 1..5: still [0.030, 0.016]
```

- **Latency is the tell.** Real rerank = ~4–6 s; degraded = ~1–2 s. When latency
  drops, `relevance_score` collapses to the raw score with **no error**.
- **Cause:** almost certainly a quota/rate-limit on the rerank (Gemini) backend
  — we made ~20+ rerank calls this session (calibration + live + probes).
  Recovery window is >40 s.
- **Impact:** rerank-based relevance is **not reliably available**.

## Why the threshold is still the right design (safe by construction)

| Situation | relevance_score | At threshold 0.3 |
|---|---|---|
| rerank healthy + related | 0.7–1.0 | ✅ kept |
| rerank healthy + unrelated | ~0.016 | ✅ dropped |
| **rerank degraded (any)** | ~raw (~0.03) | ✅ dropped — **no noise** |

When rerank is down, nothing clears 0.3, so recall **conservatively injects
nothing** rather than injecting unranked noise. The only cost is occasionally
missing a relevant memory while rerank is throttled — the correct tradeoff for a
real product (better silent-miss than irrelevant-history-in-the-debate).

Added observability: `recallMemories` logs `reranked=true/false` and warns when
relevance==raw despite stored hits ("couldn't judge relevance" ≠ "no memory").

## Caveats / open

- **Threshold from N=1 seed.** 0.3 has margin but should be re-checked across
  more memory types once rerank quota allows.
- **Rerank reliability is a real blocker for shipping.** Options to raise with
  AgentMem / decide later:
  1. Ask AgentMem whether rerank should *error* instead of silently returning
     raw (silent degradation is the actual bug here).
  2. Cache the relevance per (query, memory) so we don't re-rerank identical
     lookups (also helps the rate-limit).
  3. Accept "best-effort memory" semantics: present when rerank is healthy,
     absent otherwise.
- **Cost:** rerank adds ~+4–5 s to recall (once per debate). On a ~45 s debate
  that's ~10%. Acceptable, but it's the dominant memory cost now.

## Verdict

Block I works as designed and is **safe by construction** even under rerank
failure. But it surfaced the real shipping blocker: **rerank is the only thing
that makes relevance filtering possible, and it degrades silently under load.**
That's the top item to resolve with AgentMem before this goes to production.
