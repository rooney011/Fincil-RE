# AgentMem Integration Test — Fincil

**Branch:** `scratch/agentmem-test`
**Started:** 2026-05-20
**Goal:** Evaluate whether `@agentmem/vercel-ai-provider` is worth adopting in Fincil's multi-persona debate flow.
**Outcome:** ✅ Worth keeping. All blocks (A–M) closed across 7 iterations — see
`SUMMARY.md` for the final recommendation. Memory gives the council cross-session
continuity at ~8% latency cost; the one item to harden before production is
rerank reliability (mitigated client-side).

## What gets memory

Fincil's debate flow has three LLM agents per session:
- **Miser** (risk-averse persona, streamed)
- **Visionary** (opportunity persona, streamed)
- **Twin** (structured verdict, `generateObject`)

Plus a Referee that decides when to terminate early.

The test integrates AgentMem on the two streaming personas first, with the option to expand to Twin later.

## Test layout

| File | Purpose |
|---|---|
| `01-setup.md` | Branch, package install, env wiring |
| `02-integration.md` | Code changes to `debate.ts` + `/api/debate/route.ts` |
| `03-smoke-test.md` | First live run, observations, latency + recall findings |
| `04-block-g.md` | Instrumentation; once-per-debate recall (~11 s → ~1.3 s); rerank probe |
| `05-block-k.md` | Richer memory + the positioning fix (system→task prompt) → memory finally used |
| `block-k-transcript.md` | Shareable transcript showing personas referencing prior decisions |
| `06-block-i.md` | Rerank + relevance threshold (≥0.3); the rerank-degrades-silently finding |
| `07-closeout.md` | Blocks M/L/J: stability, confabulation, voice bleed, position-vs-nudge |
| `ARCHITECTURE.md` | **Living** block-by-block data-flow + status + benchmark table |
| `SUMMARY.md` | **Living** verdict: keep / drop / iterate. Findings + recommendation |

### Reusable test scripts (run from project root)

All need `.env.local` with `AGENTMEM_API_KEY`, `OPENAI_API_KEY`, and
`FEATURE_AGENTMEM=true` (except `baseline.mts`, which forces it off):

```bash
# Two-debate recall test → writes live-test-result.json
node --env-file=.env.local --import tsx notes/agentmem-test/live-test.mts

# Memory-OFF latency baseline (forces the flag off)
FEATURE_AGENTMEM=false node --env-file=.env.local --import tsx notes/agentmem-test/baseline.mts

# Ad-hoc memory search for a given workflowId → prints scores + latency
node --env-file=.env.local --import tsx notes/agentmem-test/search-probe.mts <workflowId>

# Compare rerank:false vs rerank:true for a given workflowId (score vs relevance)
node --env-file=.env.local --import tsx notes/agentmem-test/rerank-probe.mts <workflowId>

# Block I: calibrate relevance_score across related/unrelated queries (picks threshold)
node --env-file=.env.local --import tsx notes/agentmem-test/calibrate-relevance.mts

# Block I: confirm threshold keeps related / drops unrelated for a workflowId
node --env-file=.env.local --import tsx notes/agentmem-test/block-i-drop-test.mts <workflowId>

# Block I: rerank stability — same query ×5 (exposes silent degradation)
node --env-file=.env.local --import tsx notes/agentmem-test/rerank-stability.mts <workflowId>

# Block L/J capstone: N=3 stability + confabulation + voice-bleed (rerank off so memory is present)
AGENTMEM_RERANK=false AGENTMEM_MIN_RELEVANCE=0 \
  node --env-file=.env.local --import tsx notes/agentmem-test/finish-test.mts
```

These bypass the HTTP route + Supabase auth (can't drive a session headlessly)
but call the real `streamDebate()`, so they exercise the actual memory wiring.

## Integration shape

```
User → /api/debate (route.ts)
        ↓ (passes user.id as workflowId)
     streamDebate
        ↓
     streamPersonaTurn(agent="miser" | "visionary")
        ↓
     wrapLanguageModel({
       model: openai("gpt-4o-mini"),
       middleware: createAgentMemMiddleware({
         apiKey: AGENTMEM_API_KEY,
         agentId: agent,              // "miser" | "visionary"
         workflowId: userId,          // per-user isolation
         scope: "team",               // both personas can read each other's memories
       }),
     })
```

After the Twin verdict, write a memory summarizing the outcome so future debates have context.

## Open questions before we start

1. Is `team` scope correct, or should each persona be `private`? Tradeoff: shared memory means Visionary can see what Miser noticed last time, but it also pollutes each persona's "voice."
2. Do we use one `workflowId` per user (durable lifetime memory) or one per session? Lifetime is more useful but means a noisy first debate poisons forever.
3. Twin verdict — `generateObject` doesn't go through Vercel AI SDK middleware the same way. Wrap it too, or call `mem.write` directly after?

Notes in `01-setup.md` will pick these up.
