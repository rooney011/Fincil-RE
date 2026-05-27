# Iteration 02 — Integration

**Date:** 2026-05-20

## Packages installed

```
pnpm add @agentmem/vercel-ai-provider @agentmem/sdk
```

| Package | Version |
|---|---|
| `@agentmem/vercel-ai-provider` | 0.1.1 |
| `@agentmem/sdk` | 0.7.2 |

**Compatibility check (before writing any code):**
- Provider peer deps: `ai ^6.0.0` (have **6.0.182** ✓), `zod ^3.25.76 || ^4.0.0` (have **4.4.3** ✓).
- Provider middleware targets `LanguageModelV3Middleware` from `@ai-sdk/provider`. `@ai-sdk/provider@3.0.10` is present transitively — matches AI SDK v6's LanguageModelV3 line ✓.
- SDK `MemoryStore.write/search` signatures match the skill's documented surface ✓.

## Files changed

| File | Change |
|---|---|
| `src/lib/env.ts` | Added optional `AGENTMEM_API_KEY` (lazy — not required at boot) + `features.agentmem` flag (default OFF) |
| `.env.example` | Documented `AGENTMEM_API_KEY` + `FEATURE_AGENTMEM=false` |
| `src/lib/ai/memory.ts` | **NEW** — the only module that imports AgentMem. Exports `memoryEnabled`, `withMemory()`, `rememberVerdict()` |
| `src/lib/ai/debate.ts` | Wrapped persona model via `withMemory()`; added `userId` to `DebateInput`; `rememberVerdict()` after Twin |
| `src/app/api/debate/route.ts` | Pass `userId: user.id` into `streamDebate` |
| `src/app/api/appeal/route.ts` | Pass `userId: user.id` into `streamDebate` |

## Key design choice: an isolation seam

All AgentMem imports live in `src/lib/ai/memory.ts`. Nothing else in the app touches the packages. Every export degrades to a **no-op** when memory is disabled:

- `withMemory(model, opts)` → returns the bare `model` unchanged when the flag is off or `userId` is missing.
- `rememberVerdict(...)` → returns immediately, writes nothing.

This means the debate code path is **identical to pre-AgentMem** when the flag is off — zero added latency, zero new failure modes. The feature is genuinely opt-in. Good for A/B benchmarking: flip one env var, re-run, compare.

## Recall configuration (the middleware)

```ts
createAgentMemMiddleware({
  apiKey,
  agentId: "miser" | "visionary",   // per-persona
  workflowId: userId,               // per-user, lifetime
  scope: "team",                    // personas share memory within a user
  topK: 3,
  prefix: "RELEVANT MEMORY FROM THIS USER'S PAST COUNCIL SESSIONS ...",
})
```

On every persona turn, the middleware semantic-searches AgentMem with the turn's prompt and prepends up to 3 matching memories to the system prompt.

## Write configuration (the verdict)

After the Twin renders the verdict, `rememberVerdict()` writes one memory:

```
agentId:    "twin"
scope:      "team"
role:       "observer"
workflowId: userId
content:    'The council {approved|rejected} the request to "{query}" for ₹{amount}. Reasoning: {reasoning}'
```

So the *outcome* of every debate becomes recallable context for the next one.

## Verification (no key required)

- `pnpm typecheck` → clean (after fixing one type: `withMemory` must take the
  `LanguageModelV3` object type, not `ai`'s `string | model` union alias).
- `pnpm lint` → clean.
- `pnpm test` → 23/23 pass. No regression with flag OFF.

## Not yet done

- **Live end-to-end test** — needs a real `AGENTMEM_API_KEY` in `.env.local`
  and `FEATURE_AGENTMEM=true`. See `03-smoke-test.md`.

## Refinement noted for later

The middleware searches using the *entire* formatted prompt (big context block),
not just `input.query`. Semantic search still surfaces relevant hits because the
prompt leads with "User wants to: {query}", but a tighter query (just the
purchase intent) might improve recall precision. Candidate for iteration 04 if
the smoke test shows noisy recall.
