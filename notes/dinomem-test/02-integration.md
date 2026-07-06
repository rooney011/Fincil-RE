# DinoMem Test — 02 Integration Decisions

**Date:** 2026-07-05

---

## Adapter location

`src/lib/ai/memory-dinomem.ts` — mirrors `memory-agentmem.ts` structure.
Implements the `MemoryBackend` interface from `memory-types.ts`.
Zero new dependencies — plain `fetch` only.

## Dispatch wiring

`src/lib/ai/memory.ts`:
```
MEMORY_PROVIDER=dinomem → memory-dinomem.ts
```
`src/lib/env.ts`: `DINOMEM_API_KEY` added to `serverSchema` (optional, like
the other provider keys; app starts without it, debate degrades gracefully).

## agentId convention

All personas receive a `fincil-` prefix in the adapter:
- `agentId: \`fincil-${opts.agentId}\`` on search (e.g., `fincil-council`)
- `agentId: "fincil-twin"` on writes (consistent with other adapters)

This keeps DinoMem's Agents tab clean (all Fincil traffic groups under `fincil-*`)
and prevents collisions with any other org activity on the key.

## Per-user isolation

`workflowId: userId` on BOTH write and search.

- Write: stores `workflow_id` on each memory row
- Search: strict equality filter — returns ONLY memories with that `workflow_id`
- Means: user A can never see user B's debate memories, even on a shared org key

(factKeyPrefix was the originally planned approach but is not filtering on the
live production endpoint — see 01-setup.md.)

## factKey strategy (P1 bi-temporal)

`factKey: \`fincil.purchase.${slugify(args.query)}\``

The `slugify()` function: lowercase, strip currency symbols, remove non-word
chars, truncate at 40 chars. Result is a stable slug from the purchase query.

**Consequence:** Two debates about the same purchase (same query slug) write to
the same factKey. The second debate **supersedes** the first:
- Prior window: `valid_from=debate1_time, valid_to=debate2_time`
- New window: `valid_from=debate2_time, valid_to=null`
- History stays queryable via `GET /v1/memory/:id/history`

This is the moat's P1 in action — the council's verdict on a specific purchase
is a versioned fact, not a growing pile of episodic memories. The pgvector
baseline accumulates unbounded rows; DinoMem supersedes.

**The three debates in this test run each have DIFFERENT slugs** (laptop seed,
laptop upgrade, shoes) — so no supersession occurred this run, by design.

## Rerank + relevance threshold

- `rerank: true` by default (same as agentmem; env-tunable via `DINOMEM_RERANK`)
- Threshold: `relevance_score >= 0.3` (same calibration as agentmem Block I)
- Fallback: if `relevance_score` is absent (rerank unavailable), `score` is used
  (~0.016 for most hits — essentially nothing passes 0.3, so recall injects nothing)
- Silent-degrade detection: if ALL hits have `relevance_score ≈ score`, log a warning
  and inject nothing (same safe-by-construction approach as agentmem)

Calibration from probing (confirmed matches agentmem Block I calibration):
```
near-exact match: relevance_score = 1.0
related match:    relevance_score = 0.4
unrelated:        relevance_score = 0.0  (collapses to raw score ~0.016)
```
0.3 threshold keeps "related" memories, drops everything else.

## What the write stores

`formatDebateMemory(args)` from `memory-types.ts` — identical across ALL four
backends. The stored text (~900-1200 chars) includes:
- Date + purchase query + amount + category
- Council verdict (APPROVED/REJECTED)
- Financial snapshot (surplus, EMI %, safety)
- Miser's closing argument
- Visionary's closing argument

This verbatim content is what the council recalls next session.

## Deviations from memory-agentmem.ts

| Aspect | agentmem | dinomem |
|---|---|---|
| Transport | @agentmem/sdk (MemoryStore) | plain fetch |
| agentId on write | "twin" | "fincil-twin" |
| agentId on search | opts.agentId | "fincil-" + opts.agentId |
| workflowId | SDK param | REST body param |
| factKey | not used (SDK 0.8 lacks it) | "fincil.purchase.<slug>" (P1) |
| scope | "team" (SDK param) | "team" (REST body) |
| Response shape | SDK abstracts | raw: flat array / {writeId,...} |

Everything else (recall cadence, query, topK=3, formatDebateMemory content,
best-effort write, onRecall/onWrite telemetry hooks) is identical.

## Typecheck

`bash node_modules/.bin/tsc --noEmit -p tsconfig.json` → **0 errors** after
adding the adapter, dispatcher update, and env key.
