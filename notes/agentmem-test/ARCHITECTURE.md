# AgentMem × Fincil — Architecture & Data Flow (living doc)

> **Purpose.** A block-by-block map of how memory threads through the council
> debate: what's built, how data moves, and where to read benchmark numbers.
> Updated at the end of every iteration. Each block has a **status**, a
> **data-flow** description, and **benchmark hooks** (what to measure there).
>
> **Legend:** ✅ done · 🚧 in progress · ⬜ not started · ⛔ blocked

**Last updated:** 2026-05-20 (iteration 07 — closeout: Blocks M, L, J + attribution)

---

## 0. System at a glance

```
                          ┌─────────────────────────────────────────┐
   POST /api/debate       │            streamDebate()                │
   {query, amount, ...}   │  (src/lib/ai/debate.ts)                  │
        │                 │                                          │
        ▼                 │   round loop (≤5):                       │
  ┌───────────┐  user.id  │   ┌────────────────────────────────┐    │
  │ route.ts  │──────────▶│   │ Miser turn   ── withMemory() ─┼──┐ │
  │ (auth +   │           │   │ Visionary    ── withMemory() ───┼─┐│ │
  │  RAG +    │           │   │ Referee (no memory)             │ ││ │
  │  goals)   │           │   └────────────────────────────────┘ ││ │
  └───────────┘           │   Twin verdict (generateObject)      ││ │
        ▲                 │        │                              ││ │
        │ SSE stream      │        ▼                              ││ │
        │ (chunks +       │   rememberVerdict() ──write──┐        ││ │
        │  verdict)       └──────────────────────────────┼────────┼┼─┘
        │                                                ▼        ▼▼
        │                                       ┌──────────────────────┐
        └───────────────────────────────────────│   AgentMem REST API  │
                                                │  (workflowId=user.id)│
                                                └──────────────────────┘
```

Two memory touchpoints: **recall** (read — as of iteration 04, **once per
debate** via manual `recallMemories`, injected into every persona turn) and
**write** (once, after the Twin verdict). Earlier iterations recalled per-turn
via `createAgentMemMiddleware`; Block G replaced that — see Block D.

---

## Block A — Feature gate & config  ✅

**Files:** `src/lib/env.ts`, `.env.example`

**What it does.** Decides whether memory is live at all. Memory is active only
when `FEATURE_AGENTMEM=true` **and** `AGENTMEM_API_KEY` is set. Either missing →
the whole feature is a no-op.

**Data flow.**

```
process.env.FEATURE_AGENTMEM ─┐
                              ├─▶ features.agentmem (boolean)
process.env.AGENTMEM_API_KEY ─┴─▶ memoryEnabled = flag && !!key
```

**Why it matters for benchmarking.** This is the A/B switch. Same code, same
prompts, flip one env var → "memory ON" vs "memory OFF" arms. No other change
needed between runs.

**Benchmark hooks.** None itself — it's the control variable.

---

## Block B — Isolation seam (`memory.ts`)  ✅

**File:** `src/lib/ai/memory.ts` (the **only** importer of AgentMem packages)

**What it does.** Wraps every AgentMem interaction behind three exports that
degrade to no-ops when memory is off:

- `memoryEnabled: boolean`
- `recallMemories({agentId, userId, query}) → RecallResult{text, ms, hitCount, keptCount, topRelevance, hits}` (manual search + rerank + threshold + timing)
- `rememberDebate({...}) → WriteMetric{ms, ok}` (rich write + timing, or no-op)

**Data flow (recall path — iteration 06, manual + reranked + gated).**

```
{agentId:"council", userId, query=input.query}     (once per debate, timed)
        │
        ▼
  searchMemories(query, { workflowId=userId, scope:"team", topK:3, rerank:true })
        │
   hits with relevance_score → keep only relevance_score ≥ 0.3 (Block I)
        │                       (rerank degraded ⇒ relevance≈raw ⇒ keep none = safe)
   kept → "WHAT THE COUNCIL HAS SEEN BEFORE…" block (RecallResult.text)
        │
        ▼  injected into EACH persona TASK prompt + nudge (Block K)
  streamText({ model: openai("gpt-4o-mini"), system, prompt: ctx+block+turn })
```

**Data flow (write path — iteration 05, rich).**

```
{userId, query, amount, category, verdict, snapshot, miser/visionary closings}
        │
        ▼
  MemoryStore.write({ agentId:"twin", workflowId:userId, scope:"team",
                      role:"observer", content: verdict+math+arguments })
```

**Why it matters.** One file to audit for cost, latency, and failure. If memory
ever needs to be ripped out, it's one import site.

**Benchmark hooks.** ✅ Instrumented in iteration 04 — `recallMemories` and
`rememberVerdict` both time themselves (`console.info` + return `ms`), surfaced
to callers via `DebateInput.onRecall`/`onWrite`.

---

## Block C — userId plumbing  ✅

**Files:** `src/app/api/debate/route.ts`, `src/app/api/appeal/route.ts`,
`src/lib/ai/debate.ts`

**What it does.** Carries the Supabase `user.id` from the authenticated request
down to the memory layer, where it becomes the AgentMem `workflowId`.

**Data flow.**

```
supabase.auth.getUser() ─▶ user.id
        │
        ▼ (DebateInput.userId)
  streamDebate(input)
        │
        ├─▶ recallMemories({userId, ...})   → workflowId  (once per debate)
        └─▶ rememberVerdict({userId, ...})  → workflowId
```

**Why it matters.** `workflowId = user.id` is the isolation boundary. User A's
memories never surface in User B's debate. It also defines memory **lifetime**:
one workflow per user = durable across all their sessions (chosen over
per-session, which would forget everything each debate).

**Benchmark hooks.** Memory isolation correctness — a multi-user benchmark must
confirm zero cross-`workflowId` leakage.

---

## Block D — Recall  ✅ (code) · ✅ (live: cheap, injected, AND used)

**File:** `src/lib/ai/debate.ts` → `streamDebate` (recall) + `streamPersonaTurn` (inject)

**What it does (iteration 05).** `streamDebate` calls `recallMemories` **once**,
before the round loop, searching with the purchase intent (`input.query`). The
returned memory block is passed into every `streamPersonaTurn` and injected into
the **task prompt** (next to the current math/context), with a nudge to use it.
Evolution: iter 02–03 = per-turn `createAgentMemMiddleware` (opaque, 10×
redundant); iter 04 = once-per-debate manual recall into the **system** prompt
(cheap but ignored); iter 05 = same recall into the **task** prompt (used).

**Data flow.** See Block B recall path; injection point is now the task prompt.

**Status note (iteration 06).**

- ✅ **Used:** task-prompt placement → personas reference prior decisions
  faithfully (no confabulation). See `05-block-k.md`.
- ✅ **Relevance-gated (Block I):** `rerank:true` + keep only `relevance_score ≥
  0.3`. Calibrated: near-exact 1.0, related 0.7, same-category 0.1, unrelated
  ~0.016. Drops noise; safe-by-construction even if rerank fails.
- ⚠️ **Rerank degrades silently under load** (relevance collapses to raw ~0.03,
  no error). Then recall injects nothing — safe, but memory is "best-effort".
  See `06-block-i.md`. **Top shipping blocker.**
- 💰 Recall now ~4–6.7 s with rerank (once per debate, ~10% of a debate).

**Benchmark hooks.**

- Recall latency: ~4–6.7 s with rerank, once per debate (`onRecall.ms`).
- Recall kept-rate: `keptCount`/`hitCount`; `topRelevance`; `reranked` flag.
- Recall influence: ✅ demonstrated. Voice-bleed (Block J), confabulation +
  N≥3 (Block L), rerank reliability (Block I follow-up) still open.

---

## Block E — Debate write-back  ✅ (code) · ✅ (verified live)

**File:** `src/lib/ai/debate.ts` → `streamDebate` (after `generateTwinVerdict`)

**What it does (iteration 05).** Persists a RICH summary per completed debate:
verdict + finance snapshot (surplus, EMI%, safety) + each persona's closing
argument, under `agentId:"twin"`, scope team. Was a one-line verdict (iter 02–04).

**Data flow.**

```
generateTwinVerdict() ─▶ {verdict}      transcript ─▶ last miser/visionary lines
        │                                     │
        └──────────────┬──────────────────────┘   + financeVerdict snapshot
                       ▼
rememberDebate() ─▶ MemoryStore.write(rich content)  [best-effort, never throws]
                       │
                       ▼
returns DebateResult to route.ts ─▶ SSE verdict event ─▶ client
```

**Status note (iteration 05).** Verified live — rich memory (~960–1080 chars)
written and retrievable; faithfully recalled + used in the next debate. Async
extraction settled within the 5 s wait.

**Benchmark hooks.**

- Write latency (added to tail of debate, before response close).
- Extraction lag: AgentMem extracts entities async — measure delay until a
just-written verdict is recallable by the *next* debate.

---

## Block F — Live smoke test  ✅ done (2026-05-20)

**File:** `notes/agentmem-test/03-smoke-test.md` + `live-test-result.json`.

**Result.** Ran two debates for one synthetic user. Write + recall both
round-trip. Recall returned the seeded verdict with correct ranking but low
scores and **no visible influence** on persona behavior. Latency is
OpenAI-dominated; memory tax not cleanly isolable from wall time. Full findings
in `03-smoke-test.md`.

---

## Blocks G–L

| Block | What | Status | Notes |
| ----- | ---- | ------ | ----- |
| G | Manual recall with timers, to isolate the AgentMem tax | ✅ done (iter 04) | Revealed 10× redundant search; fixed via once-per-debate recall (~11 s → ~1.3 s) |
| H | Log surfaced memories + whether the persona used them | ✅ done (iter 04–05) | Injection logged; influence confirmed once positioning fixed |
| K | Richer memory (verdict + math + persona arguments) | ✅ done (iter 05) | Rich content alone = still ignored; **task-prompt placement** = used faithfully. Position > richness |
| I | `rerank:true` + relevance threshold (≥0.3) to inject only relevant memories | ✅ done (iter 06) | Calibrated + safe-by-construction. Surfaced: **rerank degrades silently under load** |
| J | `team` vs `private` scope per persona; check voice bleed now memory is read | ✅ done (iter 07) | **0 voice bleed** across N=3; both personas reframe shared facts in own voice. `team` is correct |
| L | Confabulation + N≥3 stability check at scale | ✅ done (iter 07) | Latency stable (recall ~1.1s, write ~1.8s); **0 true confabulation**; recall faithful + cumulative |
| M | **Rerank reliability** — silent degradation under load | ⚠️ mitigated (iter 07) | Client-side env knobs (`AGENTMEM_RERANK`/`MIN_RELEVANCE`/`RECALL_NUDGE`) + logging. **Real fix upstream** |


---

## Benchmark data index

> Filled in as runs happen. Each row links to the raw numbers in a notes file.

### Iteration 03 (per-turn recall, wall-time only — superseded)


| Run      | Arm        | Debate latency | Recall                | Recall hit |
| -------- | ---------- | -------------- | --------------------- | ---------- |
| Baseline | OFF        | 45.7 s         | n/a                   | n/a        |
| Debate 1 | ON (empty) | 83.8 s         | embedded (unmeasured) | 0          |
| Debate 2 | ON (1 mem) | 52.5 s         | embedded (unmeasured) | 1          |


Caveat: OpenAI variance (±30 s) swamped wall time — memory tax not isolable.

### Iteration 04 (Block G — instrumented, clean numbers)


| Metric                            | Per-turn recall (before) | Once-per-debate (after)         |
| --------------------------------- | ------------------------ | ------------------------------- |
| Recall tax / debate (empty store) | 13,672 ms (10×)          | **2,244 ms (1×)**               |
| Recall tax / debate (1 memory)    | 10,625 ms (10×)          | **1,328 ms (1×)**               |
| Per-call recall                   | 806–2,159 ms             | 1,328–2,244 ms                  |
| Verdict write                     | 1,124–1,435 ms           | 1,826–1,830 ms                  |
| Debate wall time (ON)             | 42–84 s                  | 45–49 s (≈ OFF baseline 45.7 s) |
| Memory overhead vs baseline       | ~25%                     | **~3–4%**                       |


Rerank probe (`rerank-probe.mts`): raw `score` 0.0295/0.0161 unchanged by
rerank; `relevance_score` appears only with `rerank:true` = **1.0 / 0.4**, at
**+3.7 s/call**. Raw score ≠ relevance.

### Iteration 05 (Block K — richer memory + positioning)


| Variant          | Stored content                  | Inject location         | Personas use it?       |
| ---------------- | ------------------------------- | ----------------------- | ---------------------- |
| iter 03–04       | one-line verdict                | system prompt           | ❌                      |
| Block K change 1 | rich (verdict+math+args, ~1 KB) | system prompt           | ❌                      |
| Block K change 2 | rich (same)                     | **task prompt** + nudge | ✅ every turn, faithful |


Cost unchanged (~1.3–2.2 s recall, ~1.4–2.2 s write per debate). Influence came
from **placement**, not richness or extra API calls. Recall faithful (no
confabulation observed). Verdict stayed math-correct (rejected at 30% EMI).
Single run — N≥3 still needed for a stable benchmark number.

### Iteration 06 (Block I — rerank + relevance threshold)

Relevance calibration (single laptop memory, `calibrate-relevance.mts`):

| Query kind | relevance_score | At threshold 0.3 |
| --- | --- | --- |
| near-exact | 1.00 | keep |
| related (Block K case) | 0.70 | keep |
| same category (keyboard) | 0.10 | drop |
| diff-category / unrelated | ~0.016 | drop |

| Metric | Value |
| --- | --- |
| Recall latency with rerank (once/debate) | ~4–6.7 s (was ~1.3–2.2 s without) |
| Related debate | hits=1, kept=1, topRel=0.70 → injected + used ✅ |
| Cold start (empty) | hits=0, kept=0, no rerank cost |
| **Rerank reliability** | ⚠️ degrades silently under load: relevance→raw (~0.03), ~1–2 s, no error; did not recover in 40 s |

Behavior is safe-by-construction: degraded rerank ⇒ nothing clears 0.3 ⇒ inject
nothing (no noise). Trade-off: relevant memory may be silently missed while
rerank is throttled. **Rerank reliability (Block M) is the top shipping
blocker.** Full detail: `06-block-i.md`.

### Iteration 07 (closeout — stability, scope, attribution)

Run with rerank off so memory is reliably present (`finish-test.mts`):

| Metric (N=3) | run 1 | run 2 | run 3 | mean |
| --- | --- | --- | --- | --- |
| recall ms | 1325 | 918 | 1124 | 1122 |
| write ms | 1839 | 1820 | 1731 | 1797 |
| wall ms | 35,528 | 35,123 | 36,871 | 35,841 |

- **Confabulation:** 0 true (2 flags were faithful recalls of newer memories vs
  a stale baseline). Recall faithful + cumulative across debates.
- **Voice bleed (Block J):** 0. Both personas reframe shared team-scoped facts
  in their own voice. `team` scope correct.
- **Position vs nudge attribution:** task prompt + nudge → ~10/10 turns use
  memory; task prompt, no nudge → 5/10; system prompt → 0/10. **Position is the
  primary driver; the nudge amplifies.**

Memory tax (rerank off) ≈ 1.1 s recall + 1.8 s write ≈ ~8% of a debate. Full
detail: `07-closeout.md`.