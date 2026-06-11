# Mem0 — Iteration 02: First live run + the infer footgun

**Date:** 2026-06-11
**Script:** `notes/mem0-test/live-test.mts` (2 debates, same seeds as AgentMem's)
**Result:** ✅ Cross-session recall works and is faithful — after one fix.

## Run 1 (infer:true, the default I started with): recall FAILED

First live run stored nothing and recalled nothing — debate 2 argued fresh:

```
[memory:mem0] debate write ms=1980 verdict=approved infer=true stored=0 chars=981
direct search: 0 hit(s)
[memory:mem0] recall agent=council ms=2695 hits=0 kept=0
```

(Also: one transient OpenAI `server_error` blanked a Visionary turn in the seed
debate — unrelated to Mem0, just OpenAI flakiness.)

## The probe (`probe.mts`) — root cause

Isolated Mem0's `add` behavior directly:

| Mode | `add` response | Searchable? |
|---|---|---|
| **`infer:false`** (verbatim) | `{ status:"SUCCEEDED", results:[{id, data.memory, event:"ADD"}] }` — **synchronous** | yes, in ~2.5s (score 0.22 for a generic query) |
| **`infer:true`**, assistant-only message | `{ status:"PENDING", eventId }` — **async** | **no** — nothing landed even after 25s (assistant recap extracts poorly) |
| **`infer:true`**, user+assistant convo | `{ status:"PENDING", eventId }` — **async** | yes, landed ~10s later as `"User wants to purchase a new laptop priced at ₹80,000…"` |

**Two findings rolled into the failure:**
1. **`infer:true` is asynchronous** — `add` returns `PENDING` with *no results*, so my
   write logged `stored=0` (misleading) and the very next debate recalled nothing
   because extraction hadn't landed yet.
2. **An assistant-only recap extracts almost nothing.** Mem0's extractor wants a
   conversational/first-person signal; a third-person summary in an `assistant`
   message yields no memory in a useful window.

## The fix — `infer:false` is the apples-to-apples write

AgentMem stored the verdict summary **verbatim** (`MemoryStore.write(content)`), so
for parity Mem0 should too. Changed the default to `MEM0_INFER=false`
(`infer` is `true` only if explicitly set). The write is then synchronous and
reliable, and the stored text is identical to what AgentMem stored — so any
recall-quality difference reflects Mem0's *retrieval*, not a different write.
`infer:true` stays available (env flag) for a dedicated extraction/dedup test.

Also made the write telemetry honest: it now logs `status=SUCCEEDED|PENDING` and
treats PENDING as "accepted, async" rather than a failure.

## Run 2 (infer:false): ✅ faithful cross-session recall

```
Debate 1 (seed, cold):  recall 3547ms, 0 hits | write 2696ms SUCCEEDED stored=1
direct search (+5s):    1 hit, score 0.208 — the full verbatim summary
Debate 2 (recall):      recall 1964ms, 1 hit, kept 1, topScore 0.7784, injected 1203 chars
                        write 2560ms SUCCEEDED stored=1
```

Debate 2's personas referenced the prior decision **every turn**, faithfully:
- Miser: *"Last time, the council approved an ₹80,000 laptop with a 20% EMI impact.
  Now, a ₹1,20,000 purchase leaves you dangerously exposed."*
- Visionary: *"much like the previous ₹80,000 purchase that laid the groundwork
  for your growth."*

The recalled ₹80,000 / 20% EMI **matches the stored memory exactly** — no
confabulation. The verdict stayed math-correct (**rejected** the riskier
₹1,20,000 upgrade, math = "risky").

### Score-scale note
- Direct search ("should I buy a laptop", no rerank) → **0.208**.
- In-flow recall ("upgrade to a more powerful ₹1,20,000 laptop", **rerank on**) → **0.7784**.
Mem0's `score` is sensitive to query specificity + rerank; it is NOT on AgentMem's
scale, which is why we did NOT transplant AgentMem's 0.3 threshold
(`MEM0_MIN_RELEVANCE` defaults to 0). Calibrate separately if gating is needed.

## Raw output

`notes/mem0-test/live-test-result.json` (run 2).

## Still to do (next iterations, mirroring AgentMem)

- [ ] **Cost** — capture Mem0 free-tier usage per 1k writes / searches + the
      OpenAI debate cost (gpt-4o-mini).
- [ ] **Contradiction handling** (the TODO's headline Mem0 question) — run with
      `MEM0_INFER=true` and feed Miser-vs-Visionary conflicting facts; observe how
      Mem0's LLM dedup resolves them. Account for async landing.
- [ ] **Stability + voice bleed (N=3)** — the capstone, like AgentMem's Block L/J.
- [ ] **Relevance calibration** — decide whether a `MEM0_MIN_RELEVANCE` > 0 is
      worth it given Mem0's score scale.
