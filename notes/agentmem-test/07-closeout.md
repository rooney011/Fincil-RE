# Iteration 07 — Closeout: Blocks M, L, J + attribution

**Date:** 2026-05-20

Final iteration. Closes the remaining blocks and attributes the Block K effect.

## Block M — rerank reliability (interim mitigation)

Rerank degrades silently under load (iter 06) and did **not** recover across
this whole session (>10 min of rate-limit). We can't fix AgentMem's backend, so:

- **Env knobs added** (`src/lib/ai/memory.ts`, `.env.example`):
  - `AGENTMEM_RERANK=false` → skip rerank entirely (no relevance gating; with a
    `0` threshold, inject the top semantic hit). Avoids the silent-degradation
    trap + the ~4–5 s rerank latency.
  - `AGENTMEM_MIN_RELEVANCE=<n>` → tune the inject threshold (default 0.3).
  - `AGENTMEM_RECALL_NUDGE=false` → drop the "reference history" instruction.
- **Observability** (iter 06): `recallMemories` logs `reranked=true/false` and
  warns when relevance==raw despite stored hits.

**The real fix is upstream.** Ask AgentMem to make rerank **error** on
rate-limit instead of silently returning raw scores — silent degradation is the
actual defect; a thrown error would let us retry / fall back deliberately.

## Block L — stability (N=3) + confabulation

Run with rerank off so memory is reliably present (`finish-test.mts`):

| Metric | run 1 | run 2 | run 3 | mean |
|---|---|---|---|---|
| recall ms | 1325 | 918 | 1124 | **1122** |
| write ms | 1839 | 1820 | 1731 | **1797** |
| wall ms | 35,528 | 35,123 | 36,871 | **35,841** |

Latency is **stable** across runs (much tighter than the iter-03 ±30 s wall-time
noise — that batch happened to run consistent round counts). Memory tax with
rerank off ≈ 1.1 s recall + 1.8 s write ≈ **~8% of a debate**.

**Confabulation: 0 true.** The detector flagged 2 ₹1,20,000 mentions in run 3,
but those are **false positives**: by run 3 the council had legitimately stored
the run-1 and run-2 rejections of ₹1,20,000 laptops, so *"last time we rejected
a ₹1,20,000 purchase"* is **faithful recall of newer memories**, not invention.
(Lesson: the confab baseline must be re-snapshotted each run — the detector used
the seed-only memory.) Recall is faithful and **cumulative** across debates:

- run 1 Miser: *"Last time, a ₹7,000 EMI for an ₹80,000 laptop was already precarious."*
- run 2 Miser: *"Last time, we rejected a ₹1,20,000 laptop for the same reason."* (recalls run 1)
- run 3 Miser: *"₹1,10,000 is still a significant jump from the ₹80,000 laptop we approved in May."* + recalls the run-1/2 rejections

Verdicts stayed math-correct: ₹1,20,000 (30% EMI) → rejected; ₹1,10,000 (28%) →
approved. Memory enriched arguments; math drove the verdict.

## Block J — scope / voice bleed: NONE

Team-scoped memory stores **both** personas' closing arguments, and both read
it. Result: **0 voice-bleed lines** across N=3. Better — each persona reframes
the *same* shared fact in its own voice:

- Miser: *"a ₹7,000 EMI was already precarious"*
- Visionary: *"a manageable ₹7,000 EMI… breathing room"*

Same fact, opposite spin, no identity confusion. **`team` scope is the right
choice — no need for `private`.**

## Attribution — position vs nudge (separating the iter-05 change)

Block K changed two things at once (memory → task prompt, AND a "reference it"
nudge). Re-ran with `AGENTMEM_RECALL_NUDGE=false`:

| Variant | turns referencing history |
|---|---|
| task prompt + nudge (Block K) | ~10/10 |
| task prompt, **no nudge** | **5/10** |
| system prompt (iter 04) | 0/10 |

**Position is the primary driver** — task-prompt placement alone gets memory
used in half the turns, with zero instruction. The nudge **amplifies** it to
near-universal. The system-prompt placement was the real failure mode all along.

## Real /api/debate route — parity note

The live tests call `streamDebate()` directly, bypassing HTTP + Supabase auth
(can't drive a session headlessly). Parity is **structural**: `/api/debate` and
`/api/appeal` already pass `userId: user.id` into the same `streamDebate`, so the
memory path is identical. The only untested surface is the auth/session plumbing
— unchanged stock Fincil code. A real-session HTTP smoke test is the last
pre-merge check, but there is no code-path difference to worry about.

## All blocks status

| Block | Status |
|---|---|
| A–F (gate, seam, plumbing, recall, write, smoke) | ✅ |
| G (instrumentation / once-per-debate) | ✅ |
| H (injection + influence logging) | ✅ |
| K (rich memory + task-prompt positioning) | ✅ |
| I (rerank + relevance threshold) | ✅ |
| J (scope / voice bleed) | ✅ no bleed; team is correct |
| L (N=3 stability + confabulation) | ✅ stable; 0 true confab |
| M (rerank reliability) | ⚠️ mitigated client-side; real fix is upstream |

**Done.** See `SUMMARY.md` for the final recommendation.
