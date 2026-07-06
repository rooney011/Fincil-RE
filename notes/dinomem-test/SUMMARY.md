# DinoMem Integration — Summary & Verdict

**Date:** 2026-07-05 (integration + live test in one session)
**Status:** ✅ Complete. DinoMem REST API wired, live-tested, all three moat pillars
exercised. Recall faithful, correctly gated, cumulative. Highest latency of the
four systems tested — rerank is the bottleneck. Unique value: factKey versioning
(P1), receipts (P2), CRDT conflict detection (P0) — none of the other three
systems have these.

---

## TL;DR

DinoMem integrates cleanly behind the same pluggable `MEMORY_PROVIDER=dinomem`
seam, `debate.ts` unchanged. **Plain `fetch` against the REST API** — no SDK,
since the old `@agentmem/sdk 0.8` lacks `factKey`/`validFrom` and we want to
exercise all three moat pillars.

Cross-session recall is **faithful and used every turn**: Debate 2's Miser cited
_"Last time, you opted for an ₹80,000 laptop, which tied up only 20% of your
surplus"_ — matching the stored text, no confabulation, verdict math-correct.
Cold-start correctly injected nothing (topRel=0.00 < 0.3 threshold).

The cost: **rerank makes DinoMem the slowest managed system** (~4.2s mean recall
vs Mem0's 2.5s vs AgentMem's 1.1s). Without rerank the raw score (~0.016) is
too compressed to filter relevance, so this latency is load-bearing.

---

## Metric sheet

```
System:            DinoMem (live cloud REST API)   Version: live deploy 2026-07-05
                   (https://lwbwcuuzoituanwhekyo.supabase.co/functions/v1/api)
Access:            🟢 FREE (same sk-… key as AGENTMEM_API_KEY; same DinoMem org)
Embeddings/LLM:    DinoMem platform defaults (Gemini embeddings + hybrid search)
                   Debate LLM: openai gpt-4o-mini (Fincil's cheap-model default)
Recall quality:    ✅ referenced faithfully: D2 council cited the ₹80k approval
                   accurately every round ("Last time…only 20%…now 30%").
                   topRel=0.40 (reranked) cleared the 0.3 threshold. Cold-start
                   (shoes, unrelated) correctly injected nothing (topRel=0.00).
                   0 true confabulation. 0 voice bleed.
Latency (N=3):     recall: 2586ms / 6294ms / 3596ms → mean 4159ms
                   write: 2366ms / 2059ms / 1556ms → mean 1994ms
                   wall: 48226ms / 37796ms / 36511ms → mean 40844ms
                   Memory tax: ~6.2s / ~40.8s mean ≈ 15% — same as Mem0,
                   but recall is ~1.7× heavier than Mem0 (~2.5s) and ~4×
                   heavier than agentmem (~1.1s). Rerank dominates (+3-4s).
Cost:              🟢 same DinoMem org key — no extra cost for the sweep.
                   Production pricing TBD (product launched 2026-07-05).
Contradiction:     P0 CRDT conflict detection available via /v1/crdt/replicas
                   path (separate from regular /v1/memory/write). 3-way
                   concurrent write to same factKey → 0 open conflicts via
                   GET /v1/crdt/conflicts (auto-resolved by default policy,
                   likely timestamp_wins). Full P0 requires human_in_loop policy.
                   See "Moat pillar findings" section below in this file.
Voice bleed (N=3): 0 (workflowId isolation: exact per-user filter on search)
P1 bi-temporal:    ✅ factKey per purchase topic. Supersession OBSERVED live
                   (2026-07-06): same query at ₹1,50,000 superseded D1 (₹80k).
                   D1 valid_to closed, new write's supersedes[] contains full D1
                   record. Live search returns only new fact. 8/8 assertions pass.
                   See notes/dinomem-test/05-p1-supersession.md.
P2 receipts:       ✅ Every search generates an immutable receipt. 8 receipts
                   in the session; reader=fincil-council/fincil-probe/fincil-miser,
                   returned_ids track which memory IDs were surfaced.
DX notes:          Clean plain-fetch adapter. Key findings from probing:
                   (1) workflowId = the per-user isolation mechanism (exact filter);
                       factKeyPrefix NOT working on live endpoint — do not use.
                   (2) Search returns a FLAT ARRAY (not {results:[...]} wrapper).
                   (3) Write returns {writeId, conflictsChecked, embeddingPending}.
                   (4) rerank:true adds relevance_score (1.0 near-exact, 0.4 related,
                       0.0 unrelated) — same calibration as agentmem; threshold 0.3
                       holds. Without rerank, raw score ≈ 0.016 — unusable as a filter.
                   (5) AGENTMEM_API_KEY aliases to DINOMEM_API_KEY (same org).
Failures/quirks:   One transient OpenAI server_error in D1 (not DinoMem). Debate
                   completed anyway (5 rounds, verdict=approved). Rerank latency
                   spike in D2 (6.3s) — consistent with ~4s rerank cost seen in
                   the agentmem benchmark (Block I/G).
Raw outputs:       notes/dinomem-test/live-test-result.json
```

---

## Recall transcript excerpt (Debate 2 — memory used correctly)

Stored D1 memory:
> On 2026-07-05, the user considered: "buy a new laptop for my freelance design
> work" — ₹80,000 (electronics). Council verdict: APPROVED. Financials then:
> monthly surplus ₹35,000, estimated EMI 20% of surplus, safety "ok"…

D2 council — round 1, Miser:
> "Last time, you opted for an ₹80,000 laptop, which tied up only 20% of your
> surplus. This ₹1,20,000 laptop not only amplifies your risk but also jeopardizes
> your emergency fund…"

D2 council — round 3, Miser:
> "₹10,500 monthly EMI consumes 30% of your surplus, a sharp jump from the 20%
> tied to the previous ₹80,000 laptop."

**Position effect confirmed**: memory injected into the task prompt is cited
every round (same finding as agentmem Block K). No deviation.

---

## 4-way comparison (all systems on Fincil)

| | AgentMem | Mem0 | pgvector | **DinoMem** |
|---|---|---|---|---|
| Write | sync, verbatim | sync, verbatim (infer:false) | sync, embed+insert | sync, verbatim + factKey |
| Recall faithfulness | ✅ every turn | ✅ cumulative | ✅ cumulative | ✅ faithful |
| Memory tax | ~8% (~2.9s) | ~15% (~5.2s) | ~5.2% (~1.7s) | **~15% (~6.2s)** |
| Recall latency | ~1.1s | ~2.5s | ~0.55s | **~4.2s** |
| Confabulation | 0 | 0 | 0 | 0 |
| Voice bleed (N=3) | 0 | 0 | 0 | 0 |
| Contradiction dedup | not tested | ❌ silent coexist | n/a (no dedup) | P0 CRDT (policy-gated) |
| Relevance signal | rerank (degrades silently) | single score | cosine sim | rerank (stable in run) |
| P1 bi-temporal | ❌ | ❌ | ❌ | **✅ factKey versioning** |
| P2 receipts | ❌ | ❌ | ❌ | **✅ immutable audit trail** |
| Cost | unknown | 🟢 free tier | $0 marginal | 🟢 same org key |
| DX footgun | rerank silent-degrade; raw score misleading | infer:true async + poor extraction; search needs `filters` | service-role DDL; node ≥22 for supabase-js | factKeyPrefix not live; search is bare array; workflowId is the isolation key |

---

## Moat pillar findings

### P0 (conflicts)
3-way concurrent write of the same `factKey` → `conflictsChecked: true` on all
three responses, but `GET /v1/crdt/conflicts` returns 0 open conflicts. The
regular `/v1/memory/write` path auto-resolves (timestamp policy). True open
conflicts require `human_in_loop` org policy + the CRDT replicas path
(`POST /v1/crdt/replicas/:rid/write`). Not a bug — by design for managed systems.

### P1 (bi-temporal)
factKey per purchase topic (`fincil.purchase.<slug>`) written on every debate.
**Supersession observed live (2026-07-06):** ran a second debate on the same query
("buy a new laptop for my freelance design work") at ₹1,50,000 with the same
userId/workflowId. The second `rememberDebate` write closed D1's `valid_to`, set
D1's `superseded_by` to the new writeId, and the new memory's `supersedes[]` contains
the full D1 record with timestamps. A fresh reranked search returns only the new fact —
D1 is absent from live results. 8/8 assertions passed (4a recall pre-write ✅,
4b lineage ✅, 4c search suppression ✅, 4d receipts ✅).
See `05-p1-supersession.md` for full evidence including raw history JSON.
`validFrom` not used in the adapter (defaults to `now()`) — add for backdating.

### P2 (receipts)
Every recall search generates a receipt. Confirmed: 8 receipts across the session
(3 debate recalls + the history probe + prior session probes). `reader_agent` is
set from the `agentId` we pass in the search body. `returned_ids` tracks which
memory rows were surfaced to that reader. Immutable — can't be deleted.

---

## Recommendation

**DinoMem is the right memory layer for Fincil when you want the moat features
(P1 versioning + P2 audit receipts)**. Recall quality matches the other systems
(faithful, task-prompt-injected, every round). Zero confabulation. Zero voice bleed.

**The price: rerank adds ~3-4s to recall.** At once-per-debate cadence this is
~15% of a ~40s debate — the same tax as Mem0, but with recall 1.7× heavier.
If latency matters more than the moat features, pgvector (floor: 5.2% tax) or
AgentMem (8% tax) are faster; DinoMem earns its keep when bi-temporal versioning
or receipt auditing is a product requirement.

**Production path:**
1. DINOMEM_API_KEY → dashboard → API keys (sk-… format, same key as AGENTMEM_API_KEY).
2. Tune `DINOMEM_RERANK=false` to drop to raw scores if 3-4s rerank is too heavy
   (then lower `DINOMEM_MIN_RELEVANCE` to 0 to keep all top-k).
3. For P0 conflicts to surface in the dashboard: configure the org default policy
   to `human_in_loop` (Settings → Default conflict policy).
4. Verify receipt reader_agent in dashboard → Audit/Receipts to confirm
   `fincil-miser`/`fincil-visionary`/`fincil-twin` appear as distinct readers.

---

## Iteration log

| | File | What |
|---|---|---|
| 01 | `01-setup.md` | Discovery: workflowId is the right isolation key, not factKeyPrefix |
| 02 | `02-integration.md` | Adapter design decisions + response shape probing |
| 03 | `live-test.mts` | 3-debate recall sweep + P0/P1/P2 moat section |
| 05 | `live-test-p1.mts` | P1 supersession observed run (same factKey, second debate) |
| — | `live-test-result.json` | Raw output of the 2026-07-05 live run |
| — | `live-test-p1-result.json` | Raw output of the 2026-07-06 P1 supersession run |
| — | `05-p1-supersession.md` | P1 evidence: history JSON, search-after, verdict |
| — | `SUMMARY.md` | This file |
