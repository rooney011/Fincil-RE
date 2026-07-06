# 05 — P1 bi-temporal supersession: observed (2026-07-06)

**Status:** ✅ All 4 assertions pass (8/8 sub-assertions). P1 supersession confirmed live.

---

## What ran

A second debate on the **exact same query as D1** ("buy a new laptop for my freelance design work")
at ₹1,50,000, using the same `userId = "dinomem-livetest-888408cb"` as the 2026-07-05 run.

`rememberDebate` derives the factKey via `slugify(query)`:

```
slugify("buy a new laptop for my freelance design work")
  → "buy-a-new-laptop-for-my-freelance-design"   (40 chars, cut at 'n')
factKey = "fincil.purchase.buy-a-new-laptop-for-my-freelance-design"
```

Both D1 (₹80k, 2026-07-05) and the new write share this factKey. Writing to the same
factKey triggers P1 bi-temporal supersession: the second write closes the first's
`valid_to` and records lineage in `GET /v1/memory/:id/history`.

**Script:** `notes/dinomem-test/live-test-p1.mts`
**Raw output:** `notes/dinomem-test/live-test-p1-result.json`

---

## Pre-flight (D1 state before write)

| Field | Value |
|---|---|
| `id` | `cbeee35c-06c4-48aa-842c-b882a7a1bd55` |
| `fact_key` | `fincil.purchase.buy-a-new-laptop-for-my-freelance-design` |
| `valid_from` | `2026-07-05T14:25:38.595317+00:00` |
| `valid_to` | `null` (window open) |
| `superseded_by` | `null` |

---

## Assertion results

### 4a — Recall surfaced old ₹80k memory pre-write ✅

Before `rememberDebate` writes, `recallMemories` ran and returned 3 hits, 2 kept
(relevance ≥ 0.3). topRel = **1.0000**. The council transcript confirms the old
memory was injected and used — every round cited the prior ₹80k approval:

> "The ₹80,000 laptop was a balanced decision before…"
> "We previously endorsed the ₹80,000 option…"

This confirms the old window was open and visible during the debate that would supersede it.

### 4b — Supersession lineage in history ✅ (4/4 sub-assertions)

**D1 post-write** (`GET /v1/memory/cbeee35c.../history`):

```json
{
  "valid_to": "2026-07-06T01:43:55.937+00:00",
  "superseded_by": "527a0e84-05d1-40fc-b8d3-5c2f13ee009a"
}
```

Window **closed**. Points to the new write.

**New memory** (`GET /v1/memory/527a0e84.../history`):

```json
{
  "id": "527a0e84-05d1-40fc-b8d3-5c2f13ee009a",
  "fact_key": "fincil.purchase.buy-a-new-laptop-for-my-freelance-design",
  "valid_from": "2026-07-06T01:43:56.006297+00:00",
  "valid_to": null,
  "superseded_by": null,
  "supersedes": [
    {
      "id": "cbeee35c-06c4-48aa-842c-b882a7a1bd55",
      "fact_key": "fincil.purchase.buy-a-new-laptop-for-my-freelance-design",
      "valid_from": "2026-07-05T14:25:38.595317+00:00",
      "valid_to": "2026-07-06T01:43:55.937+00:00",
      ...
    }
  ]
}
```

The `supersedes` array contains the full D1 record with its closed validity window.
Lineage is bidirectional and complete.

### 4c — Fresh reranked search returns only new fact ✅

```
POST /v1/memory/search { rerank: true, workflowId: "dinomem-livetest-888408cb" }

hits: 4
  527a0e84 rel=1.0000  "On 2026-07-06, the user considered: 'buy a new laptop…'"  ← NEW
  3a9096ad rel=0.7000  "On 2026-07-05, the user considered: 'upgrade to a more powerful ₹1,20,000…'"
  281c3ae5 rel=0.1000  "buy a new pair of running shoes"
  646e38ae rel=0.0000  "Twin: APPROVE with conditions…"
```

D1 (`cbeee35c`) is **absent from search results** — the old ₹80k fact does not appear
at all. The new fact (₹1,50,000, verdict=rejected) is top with rel=1.0. P1 suppression
works: superseded facts are excluded from live search.

### 4d — Receipts present (P2 regression) ✅

4 `fincil-probe` receipts in `GET /v1/receipts`, plus a `fincil-council` receipt from
the debate recall. P2 continues to generate receipts for every search. No regression.

---

## Debate outcome

Same query, higher amount (₹1,50,000 vs ₹80,000): **REJECTED**. EMI = ₹13,125 = 38%
of surplus — both personas converged on "too risky." The memory written captures this:

```
On 2026-07-06, the user considered: "buy a new laptop for my freelance design work"
— ₹1,50,000 (electronics). Council verdict: REJECTED.
```

The council correctly cited the prior ₹80k verdict in every round ("we previously
endorsed the ₹80,000 option") — demonstrating that bi-temporal recall also powers
cross-debate continuity, not just supersession.

---

## Verdict

P1 bi-temporal supersession is **observed**, not just structural:

- Same factKey written twice → prior `valid_to` closed, new window opened.
- Lineage is bidirectional (`superseded_by` on D1, `supersedes` array on new write).
- Live search correctly returns only the new fact; D1 is suppressed.
- The mechanism is policy-independent (no conflict detection required — factKey alone triggers supersession at write time).
