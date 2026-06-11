# Mem0 Integration — Summary & Verdict (living)

**Branch:** `scratch/agentmem-test`
**Last updated:** 2026-06-11 (iteration 04 — capstone + cost; Mem0 sweep complete)
**Status:** ✅ Mem0 benchmark complete. Integrated, faithful cumulative recall,
stable (N=3), 0 true confabulation, 0 voice bleed, free for the sweep. Higher
latency tax than AgentMem (~15% vs ~8%). Contradiction dedup does NOT resolve
out-of-box (infer:true) — so the main path stays infer:false.

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
Recall quality:    ✅ referenced EVERY turn, faithfully + CUMULATIVELY (by debate 3
                   recall kept=3, cited the ₹80k approval AND the ₹1.2L rejections
                   accurately). 0 true confabulation. topScore 0.78–0.88 (rerank on).
Latency/debate:    N=3: recall mean 2474ms (p50 2260), write mean 2710ms (p50 2658),
                   wall mean 34847ms. Memory tax ~5.2s ≈ ~15% of a ~35s debate.
                   (AgentMem ref: ~8% / recall ~1.1s — Mem0 recall is ~2× heavier.)
Cost:              🟢 Free tier (10k adds + 1k retrievals/mo) → ~1,000 debates/mo
                   free (retrieval-bound); whole sweep is free. Cheapest paid
                   (Starter $19): ~$3.80 per 1k debates. infer:false = no extraction
                   LLM cost to us. (gpt-4o-mini debate cost is shared, excluded.)
Contradiction:     ❌ out-of-box, does NOT resolve (iter 03). Numeric contradiction
                   SILENTLY COEXISTS (stale ₹35k + new ₹15k both live, no UPDATE);
                   conflicting persona recommendations aren't stored at all
                   (extraction is user-fact-centric, drops assistant opinions).
                   infer:true is also async+slow (~30s to land). Caveats: tuning
                   (customInstructions/latestOnly/decay) untested. See 03-contradiction.md.
Voice bleed (N=3): 0  (team scope: both personas cite shared history in own voice)
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

## vs AgentMem (complete)

| | AgentMem | Mem0 (infer:false) |
|---|---|---|
| Write | synchronous, verbatim | synchronous, verbatim |
| Recall faithfulness | ✅ (after task-prompt placement) | ✅ + cumulative across sessions |
| Memory tax (N=3) | ~8% (recall ~1.1s, write ~1.8s) | ~15% (recall ~2.5s, write ~2.7s) — recall ~2× heavier |
| Confabulation | 0 true | 0 true |
| Voice bleed (N=3) | 0 | 0 |
| Relevance signal | rerank `relevance_score`, degrades silently under load | single `score` (0.78–0.88), rerank server-side; no silent-degrade seen |
| Contradiction (infer/dedup) | not separately tested | ❌ does NOT resolve out-of-box; conflicts coexist |
| Cost | $ never pinned | 🟢 free for the sweep; ~$3.80/1k debates on Starter |
| Footgun | rerank silent-degrade; raw score misleading | infer:true async + extracts poorly; search needs `filters` not user_id |

## Recommendation (final for Mem0)

Mem0 is a **viable drop-in** that matches AgentMem on what matters most for Fincil
— faithful, used-every-turn, **cumulative** cross-session recall — with 0 true
confabulation and 0 voice bleed, and it's **free** for the benchmark sweep
(~$3.80/1k debates if scaled on the cheapest paid tier).

Two honest trade-offs vs AgentMem:
1. **Latency** — Mem0's recall is ~2× heavier (~2.5s vs ~1.1s); memory tax ~15%
   vs ~8% on this workload.
2. **Contradiction dedup is marketing, not reality here** — Mem0's signature
   `infer:true` LLM extraction/dedup did **not** resolve conflicts out-of-box
   (stale facts coexist; persona opinions dropped) and is async+slow, so it's a
   poor fit for Fincil's write-then-recall loop. The verbatim `infer:false` path
   is the one to use — at which point Mem0 is essentially a well-packaged
   store+semantic-search, comparable to AgentMem minus the rerank-relevance gating.

**Bottom line:** Mem0 ≈ AgentMem on recall quality/safety, loses on latency, and
its differentiating extraction layer doesn't pay off for this multi-agent debate
use case. Next: the **pgvector floor** — if raw vector search matches both, the
managed systems aren't earning their keep on Fincil.
