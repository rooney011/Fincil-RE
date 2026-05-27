# Iteration 01 — Setup

**Date:** 2026-05-20

## Actions

1. **Branched off main:**
   ```
   git checkout -b scratch/agentmem-test
   ```
   Branch point: `31c99fa feat: env feature flags + magic-link auth`.

2. **Notes folder created** at `notes/agentmem-test/` with this iteration log structure.

## Pre-integration observations

- Debate flow lives in `src/lib/ai/debate.ts`.
  - `streamPersonaTurn` is the natural hook for Miser/Visionary memory.
  - `generateTwinVerdict` uses `generateObject` — middleware may or may not apply (Vercel AI SDK v6).
- API route `src/app/api/debate/route.ts` already has `user.id` from Supabase auth — easy to thread down as `workflowId`.
- `src/lib/env.ts` validates env at boot with zod. Need to add `AGENTMEM_API_KEY` there.
- Project uses `pnpm` (saw `pnpm-lock.yaml` + `pnpm-workspace.yaml`).

## Decisions

| Question | Decision | Why |
|---|---|---|
| Scope | `team` | Miser benefits from knowing what Visionary won last time and vice versa |
| `workflowId` | `user.id` (lifetime, not per-session) | Memory is only useful across sessions |
| `agentId` | `"miser"` / `"visionary"` | Distinguishes persona perspectives |
| Twin write | Direct `mem.write` after verdict | `generateObject` middleware behavior in AI SDK v6 is uncertain; explicit write is safer |
| Referee | No memory | It's a one-shot router, doesn't benefit from history |

## Next

- Install `@agentmem/vercel-ai-provider` (and `@agentmem/sdk` for the direct Twin write).
- Add `AGENTMEM_API_KEY` to env schema + `.env.example`.
- Ask user to paste an API key from agentmem.dev into `.env.local`.
