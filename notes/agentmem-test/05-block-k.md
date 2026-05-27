# Iteration 05 — Block K: richer memory + the positioning fix

**Date:** 2026-05-20

## Goal

Iterations 03–04 found that memory was recalled + injected but **personas
ignored it**. Block K tests the hypothesis that a one-line verdict is too thin
to be actionable — so we enriched the stored memory and gave personas a reason
to use it.

## Change 1 — richer stored memory

`rememberVerdict` → `rememberDebate`. Instead of one line, we now store
(`src/lib/ai/memory.ts`):

```
On {date}, the user considered: "{query}" — ₹{amount} ({category}).
Council verdict: {VERDICT}.
Financials then: monthly surplus ₹{surplus}, estimated EMI {emi}% of surplus, safety "{safety}".
The Miser's closing concern: "{last miser line}"
The Visionary's closing case: "{last visionary line}"
```

~960–1080 chars, capturing the decision, the math, and each side's argument.
`debate.ts` extracts each persona's last turn from the transcript + the finance
snapshot and passes them in.

## Result of Change 1 alone: STILL IGNORED

Rich memory (1207 chars incl. an explicit "build on it" prefix) was confirmed
injected into both personas' **system** prompts in debate 2 — and the personas
*still* argued only the current math, never referencing the prior approval.
(Same negative as iter 04, now with rich content + an explicit instruction.)

## Change 2 — positioning: move memory into the TASK prompt

Hypothesis: the personas respond to the *task* prompt (current math, context,
"your turn"), and treat the system prompt as background voice rules. So we moved
the recalled history out of the system prompt and into the task prompt, right
next to the current context, with a pointed nudge:

```
${formatContext(input)}
${memoryBlock}            ← recalled history, here in the task prompt

DEBATE SO FAR
...
Your turn as ${label}. 2–3 sentences. Direct.
 If the council's prior history above is relevant to this purchase, reference it explicitly.
```

## Result of Change 2: MEMORY IS NOW USED — faithfully

Debate 2 personas referenced the prior decision in **every turn**:

- Miser: *"Last time, at ₹7,000, it was already a tight fit, and you noted
  ₹10,000 in repairs."*
- Visionary: *"While the EMI is higher than last time…"* /
  *"Remember, last time we approved an upgrade, you already felt the strain."*

**Verified no confabulation:** the "₹10,000 repairs" and "₹7,000 EMI" the Miser
cited came verbatim from the stored debate-1 Miser closing argument. Recall was
faithful, not hallucinated. Full transcript: `block-k-transcript.md`.

The verdict stayed **rejected** — correct, because the live math genuinely says
risky at 30% of surplus, and personas must not contradict the math. Memory
enriched the *arguments* (continuity, "compared to last time") without
overriding ground truth. That's exactly the right behavior.

## The headline finding

**Position determines influence, not content richness.**

| Variant | Memory used by personas? |
|---|---|
| One-line verdict, system prompt | ❌ |
| Rich memory, system prompt | ❌ |
| Rich memory, system prompt + "build on it" instruction | ❌ |
| Rich memory, **task prompt** + nudge | ✅ (every turn, faithful) |

Cost is unchanged from iter 04 (~1.3–2.2 s recall once per debate; ~1.4–2.2 s
write). The fix was a prompt-placement change, not more API calls.

## Caveats / things to watch

- **Single run.** Strong, consistent effect across 10 turns, but N=1. Needs
  N≥3 to be a benchmark number.
- **Confabulation risk is real even if not seen here** — memory text becomes
  prompt content the model can embellish. Worth a dedicated check at scale.
- **Voice bleed not observed**, but now that memory is actually used, re-check
  whether the Miser starts quoting the Visionary's stored lines (team scope).
- **The nudge is doing work too** — we changed position AND added an explicit
  instruction at once. A clean follow-up would separate the two variables.

## Verdict shift

Block K answers the iteration-03/04 open question: **yes, AgentMem can
meaningfully influence the debate** — recalled history makes the personas argue
with cross-session continuity ("compared to last time"), which is genuinely
nicer UX than a goldfish-memory council. The blocker was never AgentMem; it was
*where we spliced the recalled text*. See `SUMMARY.md` for the revised
recommendation.
