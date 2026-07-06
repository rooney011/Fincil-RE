# DinoMem Test — 01 Setup & Discovery

**Date:** 2026-07-05
**Goal:** Wire DinoMem (the product that evolved from AgentMem) into Fincil via
the live REST API and benchmark it against the three prior systems.

---

## Access

- **API key:** existing `AGENTMEM_API_KEY` in `.env.local` (`sk-0a3f…`) — it is a
  valid DinoMem org key (same org, product renamed). Aliased to `DINOMEM_API_KEY`
  in the test script and the adapter.
- **Base URL:** `https://lwbwcuuzoituanwhekyo.supabase.co/functions/v1/api`
  (already ends in `/api`; routes append `/v1/...` directly, e.g., `/v1/memory/write`).
- **Dashboard:** https://dinomem-dashboard.vercel.app/app (create/revoke keys; receipts; conflicts)

## Why REST (not the SDK)

`@agentmem/sdk 0.8` (already in `package.json`) lacks `factKey` and `validFrom`
— the two P1 bi-temporal params. Using plain `fetch` gives full access to the
moat surface and keeps the adapter simple to audit.

## Isolation mechanism discovery

The most important pre-build discovery: **`factKeyPrefix` does NOT filter on the
live production endpoint.**

Probe:
```
POST /v1/memory/search { "factKeyPrefix": "fincil.probeuser." }
```
Returns memories with DIFFERENT factKey prefixes AND memories with NO factKey.
The filter is described in the wiring notes as a "post-fusion filter" but it
appears not to be deployed or behaves differently than expected.

**`workflowId` is the correct isolation key.** Confirmed via probe:
```bash
# Write with workflowId=X
# Search with workflowId=X → returns ONLY that user's memories
# Search without workflowId → returns everything in org
```
This is identical to how the old AgentMem SDK used `workflowId` — so the adapter
maps `userId → workflowId` exactly as before.

## Response shape discovery (probed before writing the adapter)

### POST /v1/memory/write
```json
{ "writeId": "uuid", "conflictsChecked": true, "embeddingPending": false }
```
- `conflictsChecked: true` = API checked for CRDT conflicts (auto-resolved by policy)
- `embeddingPending: false` = Gemini embedded synchronously (rare to be true)
- Does NOT echo back `factKey` — hold it locally.

### POST /v1/memory/search
Returns a **flat array** (no `{results:[...]}` wrapper):
```json
[
  {
    "id": "uuid",
    "content": "...",
    "agent_id": "fincil-twin",
    "scope": "team",
    "role": null,
    "workflow_id": "dinomem-livetest-888408cb",
    "created_at": "2026-07-05T14:25:38…",
    "vector_clock": { "fincil-twin": 1 },
    "score": 0.0164,
    "relevance_score": 0.4   // only present when rerank:true
  }
]
```
- Raw `score` ≈ 0.016 (compressed hybrid metric — not directly usable as a filter)
- `relevance_score` with `rerank:true`: near-exact=1.0, related=0.4, unrelated=0.0
- Without rerank, `relevance_score` is absent (or equals `score`)

### GET /v1/crdt/conflicts
```json
{ "conflicts": [] }
```
Returns only OPEN (unresolved) conflicts. 3-way concurrent writes with default
org policy auto-resolve → 0 open conflicts. Requires `human_in_loop` policy for
conflicts to persist as open.

### GET /v1/receipts?limit=10
```json
{
  "receipts": [
    {
      "reader_agent": "fincil-council",
      "query": "buy a new pair of running shoes",
      "returned_ids": ["uuid1", "uuid2"],
      "created_at": "..."
    }
  ]
}
```
Every search generates a receipt. `reader_agent` = `agentId` sent in the search body.
`returned_ids` = memory IDs surfaced to that reader. **Immutable — cannot delete.**

## Env setup

Add to `.env.local` (or alias from AGENTMEM_API_KEY):
```
DINOMEM_API_KEY=sk-...       # from DinoMem dashboard → API keys
MEMORY_PROVIDER=dinomem
FEATURE_AGENTMEM=true
# Optional tuning
DINOMEM_RERANK=true          # set false to skip +3-4s rerank overhead
DINOMEM_MIN_RELEVANCE=0.3    # relevance threshold after rerank
```

## Run command
```bash
# From fincil-remastered/:
node --env-file=.env.local --import tsx notes/dinomem-test/live-test.mts
```
