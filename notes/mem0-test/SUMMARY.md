# Mem0 Integration — Summary & Verdict (living)

**Branch:** `scratch/agentmem-test`
**Last updated:** 2026-06-11 (iteration 02 — first faithful recall)
**Status:** 🚧 Integrated + recall proven faithful (single-run). Remaining:
cost, contradiction handling (infer:true), N=3 stability/voice-bleed.

---

## TL;DR

Mem0 (hosted, `mem0ai` MemoryClient) drops into Fincil behind the same pluggable
`MEMORY_PROVIDER` seam as AgentMem, with `debate.ts` unchanged. Once the write
uses **`infer:false`** (verbatim — the apples-to-apples match for AgentMem's
verbatim write), cross-session recall is **faithful and used every turn**:
debate 2's council cited *"last time the council approved an ₹80,000 laptop with a
20% EMI impact"*, matching the stored memory with no confabulation, and the
verdict stayed math-correct.

**The one footgun:** Mem0's default `infer:true` is **async** (`add` returns
`{status:"PENDING"}`) AND extracts almost nothing from an assistant-only recap —
that combination silently produced zero recall on the first run. See
`02-smoke-test.md`.

---

## Metric sheet

```
System:            Mem0 (hosted platform)        Version: mem0ai 3.0.7
Access:            🟢 FREE (hosted free tier; MEM0_API_KEY)
Embeddings/LLM:    Mem0 platform defaults (server-side extraction + embeddings)
                   Debate LLM: openai gpt-4o-mini (Fincil's cheap-model default)
Recall quality:    ✅ referenced EVERY turn in debate 2, faithfully; ₹80k/20% EMI
                   recalled matches stored memory (no confabulation). Verdict
                   stayed math-correct. topScore 0.7784 (rerank on, specific query).
Latency/debate:    recall ~2.0–3.5s, write ~2.5–2.7s → ~5–6s/debate ≈ ~11–13%
                   overhead on a ~45s debate.  (AgentMem ref: ~8% / ~1.3s recall)
Cost:              TODO — Mem0 free tier covers small runs; OpenAI debate cost is
                   gpt-4o-mini. ($/1k writes & searches not yet isolated.)
Contradiction:     ❌ out-of-box, does NOT resolve (iter 03). Numeric contradiction
                   SILENTLY COEXISTS (stale ₹35k + new ₹15k both live, no UPDATE);
                   conflicting persona recommendations aren't stored at all
                   (extraction is user-fact-centric, drops assistant opinions).
                   infer:true is also async+slow (~30s to land). Caveats: tuning
                   (customInstructions/latestOnly/decay) untested. See 03-contradiction.md.
Voice bleed (N=3): TODO — capstone not yet run. (team scope works: twin's memory
                   recalled by the council.)  (AgentMem ref: 0)
DX notes:          Clean MemoryClient API. Footguns: (1) infer:true is async +
                   extracts poorly from assistant-only messages; (2) search rejects
                   top-level user_id/agent_id — scoping must go via `filters`
                   ({ AND: [{ user_id }] }); (3) score scale ≠ AgentMem's, so don't
                   transplant thresholds.
Failures/quirks:   First run stored 0 / recalled 0 due to the infer:true async +
                   thin-extraction combo (fixed by infer:false). One transient
                   OpenAI server_error blanked a turn (not Mem0).
Raw outputs:       notes/mem0-test/live-test-result.json
```

---

## How parity is held vs AgentMem

- Same `debate.ts`, same scenarios/seeds, same `topK=3`, same once-per-debate
  recall cadence (all live in shared code; only the backend module differs).
- Same stored text (`formatDebateMemory`) — verbatim on both sides (`infer:false`).
- `workflowId→user_id`, `agentId→agent_id`, `scope:"team"→filter by user_id only`.

## vs AgentMem (so far)

| | AgentMem | Mem0 (infer:false) |
|---|---|---|
| Write | synchronous, verbatim | synchronous, verbatim |
| Recall faithfulness | ✅ (after task-prompt placement) | ✅ |
| Memory tax | ~8% (~1.3s recall once-per-debate) | ~11–13% (~2–3.5s recall + ~2.5s write) |
| Relevance signal | rerank `relevance_score`, degrades silently under load | single `score`, rerank server-side; no observed silent-degrade yet |
| Footgun | rerank silent-degrade; raw score misleading | infer:true async + assistant-only extracts nothing |

## Recommendation (interim)

Mem0 is a **viable drop-in** and matches AgentMem on the thing that actually
matters for Fincil — faithful, used-every-turn cross-session recall — at a
somewhat higher latency tax (~11–13% vs ~8%, single-run; needs N≥3 to confirm).
Its LLM-extraction story (`infer:true`) is the differentiator still to be
benchmarked (contradiction handling) — and its async nature is a real DX
difference worth flagging. Finish cost + contradiction + N=3 before a final call.
