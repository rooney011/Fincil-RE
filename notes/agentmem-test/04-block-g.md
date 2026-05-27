# Iteration 04 — Block G: instrumentation + the redundancy fix

**Date:** 2026-05-20

## Goal

Iteration 03 couldn't measure the memory tax: the opaque `createAgentMemMiddleware`
hid the search latency, and OpenAI variance (±30 s) swamped wall-time diffs.
Block G replaces the middleware with **manual, instrumented recall** so we can
time the AgentMem call alone, log what's injected, and control the query.

## Changes

| File | Change |
|---|---|
| `src/lib/ai/memory.ts` | Dropped `withMemory`/middleware. Added `recallMemories()` (manual `searchMemories` + `Date.now()` timing + structured `console.info` log) returning `RecallResult`. `rememberVerdict()` now returns `WriteMetric{ms,ok}`. New types `RecallMetric`, `WriteMetric`. |
| `src/lib/ai/debate.ts` | `streamPersonaTurn` takes a pre-recalled `memoryBlock` instead of recalling itself. Added `onRecall`/`onWrite` telemetry hooks to `DebateInput`. **Recall moved to once-per-debate** (see below). |
| `tsconfig.json` / `eslint.config.mjs` | Excluded `notes/` (runtime tsx scripts, not app code). |
| `notes/agentmem-test/live-test.mts` | Collects `onRecall`/`onWrite`; prints per-turn recall + per-debate tax. |
| `notes/agentmem-test/rerank-probe.mts` | New — compares `rerank:false` vs `true`. |

Static checks: `pnpm typecheck` / `lint` / `test` (23/23) all green.

## Finding 1 — the clean memory tax (per-turn recall, before the fix)

With recall firing on every persona turn:

| Debate | Store | Recall total | Per turn | Write |
|---|---|---|---|---|
| 1 (seed) | empty | **13,672 ms / 10 turns** | ~1,367 ms | 1,124 ms |
| 2 (recall) | 1 memory | **10,625 ms / 10 turns** | ~1,062 ms | 1,435 ms |

Per-turn recall ranged 806–2159 ms. **The tax is paid even when the store is
empty** (debate 1: 0 hits, still ~1.2 s/turn). So memory costs latency *before*
it can provide any value.

## Finding 2 — recall was 10× redundant

The search query (`input.query`) is fixed for the whole debate, and `scope:"team"`
returns the *same* memories for both personas. So per-turn recall ran the
**identical search up to 10 times**, returning the identical hit each time
(every turn: 1 hit, score 0.0164, 737 chars injected). Pure waste.

**Fix:** recall once per debate, inject the same block into every turn.

| Debate | Before (per-turn) | After (once) | Reduction |
|---|---|---|---|
| 1 (seed, empty) | 13,672 ms | **2,244 ms** | ~6× |
| 2 (recall, 1 hit) | 10,625 ms | **1,328 ms** | ~8× |

Memory-ON debate wall times after the fix: 48.7 s / 45.1 s — back in line with
the OFF baseline (45.7 s). Memory overhead dropped from ~25% to **~3–4%**.

## Finding 3 — the ~0.03 score was a red herring (rerank probe)

Tightening the query to just `input.query` did **not** raise the raw scores
(~0.016–0.03). `rerank-probe.mts` explains why:

| | raw `score` | `relevance_score` | latency |
|---|---|---|---|
| `rerank:false` | 0.0295 / 0.0161 | (absent) | 1,684 ms |
| `rerank:true` | 0.0295 / 0.0161 | **1.0000 / 0.4000** | 5,398 ms |

- The raw `score` is a compressed internal metric — **not** a 0–1 relevance.
  Reading "0.03" as "3% relevant" was wrong; ranking was always correct.
- `relevance_score` (rerank only) is the real 0–1 signal: exact-match memory =
  1.0, related = 0.4. But rerank adds **~+3.7 s/call**.
- Per-turn rerank would be insane (~37 s/debate). **Once-per-debate makes rerank
  affordable** (one +3.7 s call) — and enables a real `minScore` filter so we
  only inject genuinely relevant memories. Not enabled yet — see next steps.

## Finding 4 — injection confirmed, influence still absent

We now log that 737–824 chars (the prior verdict) were injected into every
persona system prompt. Yet debate 2's Miser/Visionary **still** argued purely
from the new math and never referenced the prior ₹80k approval. So this is no
longer "maybe it wasn't injected" — it **was** injected and the personas ignored
it. Likely: a one-line verdict summary isn't actionable for personas whose job
is to argue *this* purchase from *this* math. (→ Block K: richer memory content.)

## Net

Block G turned an unmeasurable integration into a measured one and immediately
paid for itself: the instrumentation exposed a 10× redundant search, and the fix
cut the memory tax from ~11 s to ~1.3 s/debate. Recall is now cheap. The open
question is unchanged and now sharper: **even with memory cleanly injected, it
doesn't change the debate.** Whether AgentMem earns its place hinges on Blocks
I (rerank + threshold) and K (richer memories) — or the honest conclusion that
this debate is already well-grounded by live math + transaction RAG.
