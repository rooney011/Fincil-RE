# Iteration 03 — Smoke Test (live)

**Date:** 2026-05-20
**Status:** ✅ RAN — recall round-trips mechanically; recall *quality/influence* is weak (see findings)

## How it was run

The HTTP route needs a Supabase session we can't drive headlessly, so the test
calls the real `streamDebate()` directly (same memory wiring, minus auth/RAG)
via `live-test.mts`, run with:

```
node --env-file=.env.local --import tsx notes/agentmem-test/live-test.mts
```

Two debates for one synthetic freelancer (income ₹80k, expenses ₹45k), same
`workflowId` so debate 2 can recall debate 1. Raw output: `live-test-result.json`.

## Results

| Run | Memory | Rounds | Turns | Wall time | Verdict |
|---|---|---|---|---|---|
| Baseline (`baseline.mts`, flag OFF) | OFF | 5 | 10 | **45,671 ms** | approved |
| Debate 1 — seed (empty store) | ON | 5 | 10 | 83,796 ms | approved |
| Debate 2 — recall (1 memory present) | ON | 5 | 10 | 52,540 ms | rejected |

Direct memory search (`search-probe.mts`), after writes settled:

| Query | Latency | Top hit score |
|---|---|---|
| "should I buy a laptop" | 876–4037 ms | **0.0295** |
| "laptop purchase for freelance work" | 4259 ms | 0.0295 |
| "did the council approve a laptop before" | 876 ms | 0.0295 |

Both debates' verdicts were written and are retrievable. Ranking is correct
(the approved-laptop memory outranks the rejected-upgrade one for laptop
queries). `relevance_score` is absent because we didn't pass `rerank:true`.

## Findings

1. **Write path: works.** `rememberVerdict()` persisted both verdicts under
   `agentId:"twin"`, `scope:"team"`, recoverable by an `agentId:"miser"` search
   in the same workflow → confirms team-scope sharing works as designed.
2. **Recall round-trips, but scores are tiny.** ~0.03 for near-exact semantic
   queries. Rank order is right, but absolute scores are so low that any
   `minScore > 0.03` would suppress everything. We run `minScore:0` so it still
   injects — but the signal is weak. Backend scoring scale is closed-source;
   `rerank:true` (≈+0.5–1.5s/call) may be required to get usable scores.
3. **No visible influence on the debate.** Debate 2's Miser/Visionary argued
   purely from the new math (30% of surplus); neither referenced the prior
   ₹80k approval. Recall happened at the API level but did **not** change
   persona behavior. Likely causes: (a) one-line verdict memory is too thin to
   be useful, (b) strong persona system prompts override injected context,
   (c) low-relevance injection gets ignored by the model.
4. **Latency is OpenAI-dominated and noisy.** 45–84 s per 5-round debate, ±30 s
   for identical round counts. Memory's per-turn search (0.9–4.3 s standalone)
   is real but swamped by OpenAI variance — debate 2 (ON) was actually *faster*
   than debate 1 (ON) and only ~7 s over the OFF baseline. Cannot attribute a
   precise tax from wall time alone.
5. **Every debate ran the full 5 rounds.** The Referee never terminated early
   in any run. Pre-existing behavior (not memory-related) but it's the biggest
   cost driver — ~12 OpenAI calls/debate. Worth a separate look.

## Tools left in the folder (reusable)

- `live-test.mts` — two-debate recall test, writes `live-test-result.json`.
- `baseline.mts` — single memory-OFF debate for latency reference.
- `search-probe.mts <workflowId>` — ad-hoc memory search, prints scores+latency.

## Implication for benchmarking

Wall-time diffing is too noisy to measure the memory tax (OpenAI variance ≫
search cost). For trustworthy numbers we must **instrument the search call
itself** (Block G) — measure only AgentMem time, and log what gets injected per
turn (Block H) to quantify recall influence. Recommend N≥3 runs/arm once
instrumented.

---

## (Original pre-run protocol, kept for reference)

**Was BLOCKED on** `AGENTMEM_API_KEY` — now resolved.

## What's verified WITHOUT a key (no-op path)

The integration is built so that with `FEATURE_AGENTMEM` unset/false, the debate
behaves exactly as before. Evidence:

- `pnpm typecheck` → clean.
- `pnpm lint` → clean.
- `pnpm test` → 23/23 pass with the new code in place.
- `withMemory()` is a guard clause: `if (!memoryEnabled || !opts.userId) return model;`
  → returns the *same model reference*, so `streamText` runs identically.
- `rememberVerdict()` returns before any network call when disabled.

This establishes the **memory-OFF baseline arm** for benchmarking.

## To run the live test (once key is in place)

1. Add to `.env.local`:
   ```
   AGENTMEM_API_KEY=sk-...      # from agentmem.dev
   FEATURE_AGENTMEM=true
   ```
2. `pnpm dev`
3. Log in, complete onboarding (need a profile row).
4. **Debate 1 (seed):** ask the council about a purchase, e.g.
   "should I buy a ₹80,000 laptop". Let it render a verdict. This triggers
   `rememberVerdict()` → one memory written under `agentId:"twin"`.
5. **Debate 2 (recall):** ask a *related* purchase, e.g.
   "should I buy a ₹1,20,000 laptop". The middleware should recall debate 1's
   verdict and surface it to the personas.

## What to capture (benchmark data)

| Metric | How |
|---|---|
| Debate latency, mem OFF | time `/api/debate` end-to-end, flag off |
| Debate latency, mem ON | same, flag on |
| Recall latency/turn | timer around middleware (Block G, not yet instrumented) |
| Write latency | timer around `rememberVerdict` |
| Recall hit | did debate 2's persona turns reference debate 1? (read transcript) |
| Extraction lag | gap between write and when it's recallable |

## Observations

_To be filled in when run._

## Failures / surprises

_To be filled in when run._
