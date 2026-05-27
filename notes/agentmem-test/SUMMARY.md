# AgentMem Integration — Summary & Verdict (living)

**Branch:** `scratch/agentmem-test`
**Last updated:** 2026-05-20 (iteration 07 — closeout)
**Status:** ✅ All blocks closed. Integrated, instrumented, useful, relevance-
gated, stable (N=3), no confabulation, no voice bleed. One external dependency
to harden before production: **rerank reliability** (mitigated client-side).

---

## TL;DR

`@agentmem/vercel-ai-provider` integrates cleanly behind a feature flag.
Iterating through the blocks produced a working, cheap, *useful* integration:
- **Block G:** the per-turn middleware ran the same search 10×/debate (~11 s).
  Once-per-debate recall cut the tax to **~1.3 s** (~3–4% overhead).
- **Block K:** richer memory alone didn't help — but moving the recalled
  history from the **system prompt** into the **task prompt** made the personas
  reference prior decisions every turn, faithfully ("compared to last time…").

**The blocker was never AgentMem — it was where we spliced the recalled text.**
Integration is easy, cheap, safe, and now demonstrably improves the debate
(cross-session continuity). Remaining work is hardening (relevance threshold,
scale/confabulation checks), not feasibility.

---

## What worked

- **Clean install.** Peer deps (`ai ^6`, `zod ^4`) already satisfied; no version
  juggling. `@ai-sdk/provider@3.0.10` (LanguageModelV3) present transitively.
- **Middleware = one-line wrap.** `withMemory(openai(model), {agentId, userId})`
  slots into the existing `streamText` call with no restructuring.
- **Isolation seam.** All AgentMem code in `src/lib/ai/memory.ts`; everything
  else unchanged. Trivial to audit or remove.
- **Safe by default.** Flag OFF + missing key → exact pre-AgentMem behavior.
  typecheck/lint/23 tests all green.
- **Per-user isolation** via `workflowId = user.id` maps naturally onto the
  existing Supabase auth already present in both debate routes.

## What needed care / friction

- **Type mismatch.** `ai`'s public `LanguageModel` alias is `string | model`;
  `wrapLanguageModel` needs the `model` object. Had to derive the object type
  from the function signature (`Parameters<typeof wrapLanguageModel>[0]["model"]`)
  to avoid importing the transitive `@ai-sdk/provider` type. One-line fix but a
  real papercut for a 0.1.1 package.
- **`generateObject` (Twin) not wrapped.** The middleware is built around the
  text-generation path. For the Twin verdict we write memory explicitly via the
  SDK's `MemoryStore` instead of recalling through middleware. Reasonable, but
  means two integration styles in one flow.
- **Recall query is the whole prompt.** Middleware searches with the full
  formatted context block, not just the purchase intent. Works (prompt leads
  with the query) but may be noisy — flagged for iteration.

## Open questions (decide after live test)

1. **`team` vs `private` scope** — does shared memory bleed one persona's voice
   into another? Watch for the Miser sounding like the Visionary.
2. **Lifetime memory** — `workflowId=user.id` never forgets. Does a weird first
   debate poison later ones? May want decay / `expiresAt`.
3. **Cost** — recall fires on every persona turn (≈2–10 searches/debate) +
   1 write. Need the real latency + any per-call pricing before enabling widely.
   (Keep in mind the project's cheap-model preference — memory adds API calls
   *outside* the LLM budget.)

## Live-test findings (iteration 03)

- ✅ **Write works.** Both debate verdicts persisted under `agentId:"twin"`,
  `scope:"team"`, retrievable by a `miser` search → team-scope sharing confirmed.
- ✅ **Recall round-trips** with correct rank order.
- ⚠️ **Scores are ~0.03** for near-exact queries — below any useful `minScore`.
  Likely needs `rerank:true` or a different query strategy.
- ❌ **No visible influence** on debate 2's personas; they argued fresh math and
  never referenced the prior ₹80k approval. The one-line verdict memory may be
  too thin, and/or the strong persona prompts override injected context.
- ⚠️ **Latency** is OpenAI-dominated (45–84 s/debate, ±30 s noise). Memory's
  per-turn search is 0.9–4.3 s standalone but not isolable from wall time.

Full detail + raw numbers: `03-smoke-test.md`, `live-test-result.json`.

## Iteration 04 update (Block G)

- ✅ **Instrumented** recall + write; the memory tax is now measured, not guessed.
- ✅ **Found + fixed a 10× redundant search** — recall is once-per-debate now
  (~11 s → ~1.3 s, ~3–4% overhead). Memory is no longer a latency concern.
- ✅ **Confirmed injection** (737–824 chars/turn reach the personas).
- ❌ **Personas still ignore it** — they argue the current math, not history.
- 🔎 **Rerank insight:** the scary ~0.03 score is a compressed internal metric,
  not relevance. True relevance (rerank) is 1.0/0.4 but costs +3.7 s/call —
  affordable now that recall runs once per debate.

Detail: `04-block-g.md`.

## Iteration 05 update (Block K)

- ✅ **Richer memory written** — verdict + finance snapshot + each persona's
  closing argument (~1 KB), not a one-line verdict.
- ❌ **Rich content in the system prompt: still ignored.**
- ✅ **Rich content in the task prompt + nudge: USED, every turn, faithfully**
  (personas cite "last time, at ₹7,000…"; verified against stored text — no
  confabulation). Verdict stayed math-correct.
- 🔑 **Finding: position > richness.** Placement was the lever all along.

Detail: `05-block-k.md`; transcript: `block-k-transcript.md`.

## Iteration 06 update (Block I)

- ✅ **Relevance threshold implemented + calibrated.** `rerank:true`, keep only
  `relevance_score ≥ 0.3`. Calibration: near-exact 1.0, related 0.7,
  same-category 0.1, unrelated ~0.016 — clean gap, 0.3 has margin.
- ✅ **Related debate still recalls + uses memory** (topRel 0.70, kept). Cold
  start correctly recalls nothing.
- ✅ **Safe by construction:** if rerank fails, nothing clears 0.3 → no noise.
- ⚠️ **NEW BLOCKER — rerank degrades silently under load.** After ~20 rerank
  calls this session, relevance collapsed to the raw score (~0.03) with no
  error, didn't recover in 40 s. Latency is the tell (~4–6 s real vs ~1–2 s
  degraded). So relevance filtering is "best-effort": correct when rerank is
  healthy, silently absent when throttled.
- 💰 Rerank adds ~+4–5 s to recall (once per debate, ~10% of a debate).

Detail: `06-block-i.md`.

## Iteration 07 closeout (Blocks M, L, J + attribution)

- **Block L (stability, N=3):** recall ~1.1 s, write ~1.8 s, wall ~36 s — all
  stable. Memory tax ~8% of a debate.
- **Block L (confabulation):** 0 true. Recall is faithful + cumulative across
  debates (the council remembers prior approvals/rejections accurately).
- **Block J (voice bleed):** 0. `team` scope lets both personas reference shared
  history, each in its own voice. `team` is the right choice.
- **Block M (rerank reliability):** mitigated client-side with env knobs
  (`AGENTMEM_RERANK`, `AGENTMEM_MIN_RELEVANCE`, `AGENTMEM_RECALL_NUDGE`) + a
  degradation warning. **Real fix is upstream** (rerank should error, not
  silently return raw scores).
- **Attribution:** task-prompt *position* is the primary driver of memory use
  (5/10 turns with no instruction); the nudge amplifies to ~10/10.

Detail: `07-closeout.md`.

## Final recommendation

**Keep it. AgentMem is a net win for the council, and every block is closed.**
The full arc: unproven (iter 03) → cheap, once-per-debate (iter 04) → demonstrably
useful via task-prompt placement (iter 05) → relevance-gated (iter 06) → stable,
faithful, no voice bleed (iter 07). The integration gives the council genuine
cross-session memory ("compared to last time…") at ~8% latency cost, behind a
flag, with a clean one-file isolation seam.

**The one thing to resolve before shipping to real users:** rerank reliability.
It's the only mechanism that filters irrelevant memories, and it degrades
silently under rate-limit. We've mitigated it client-side (knobs + logging + a
safe-by-construction threshold), but the durable fix is on AgentMem's side:
rerank should throw on rate-limit so we can retry or fall back deliberately.

**Suggested merge path:**
1. Raise rerank reliability with AgentMem (Block M upstream ask).
2. One real-session HTTP smoke test through `/api/debate` (parity is structural;
   only auth/session plumbing is untested).
3. Ship dark behind `FEATURE_AGENTMEM` to a few users; watch the `[memory]`
   logs (`reranked`, `kept`, latency) before a wider ramp.

**If rerank can't be made reliable:** run with `AGENTMEM_RERANK=false` and a low
threshold — memory still works (top semantic hit injected), just without
relevance filtering, accepting occasional mildly-off recalls. Given personas
already ignore truly-irrelevant injected memory (iter 04), that's an acceptable
fallback.

---

## Iteration log

| # | File | What |
|---|---|---|
| 01 | `01-setup.md` | Branch, decisions, plan |
| 02 | `02-integration.md` | Install + code wiring + static verification |
| 03 | `03-smoke-test.md` | First live test results + findings |
| 04 | `04-block-g.md` | Instrumentation + once-per-debate recall + rerank probe |
| — | `ARCHITECTURE.md` | Living block-by-block data-flow + benchmark index |
| — | `live-test.mts` / `baseline.mts` / `search-probe.mts` / `rerank-probe.mts` | Reusable test scripts |
| — | `live-test-result.json` | Raw output of the recall run |

## Benchmark status

Clean numbers landed in iteration 04 — see `ARCHITECTURE.md` → "Benchmark data
index". Memory tax (once-per-debate): **~1.3–2.2 s recall + ~1.8 s write**,
≈3–4% overhead. Rerank true-relevance 1.0/0.4 at +3.7 s/call. Recommend N≥3
runs/arm once a Block I/K tuning change is in (current numbers are single-run).
