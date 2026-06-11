# pgvector — Iteration 01: Setup & Integration

**Date:** 2026-06-11
**Branch:** `scratch/agentmem-test`
**Goal:** Benchmark a plain **pgvector** baseline (BENCHMARK_TODO #2) — the FLOOR.
No extraction, no dedup, no rerank: store the verbatim debate summary, embed it,
retrieve by cosine top-k. If a managed system can't beat this on Fincil, it isn't
earning its keep.

## What got built (behind the same pluggable seam)

| File | Role |
|---|---|
| `supabase/migrations/20260611000000_council_memories.sql` | **NEW** — `council_memories` table (`vector(768)`) + `match_council_memories` RPC (cosine top-k, team-scoped by user_id) + RLS. Same pattern as the existing `transactions` / `match_transactions`. |
| `src/lib/ai/memory-pgvector.ts` | **NEW** — backend implementing `MemoryBackend`. Uses Fincil's own `embedDocument`/`embedQuery` (gemini-embedding-001 @ 768) + a Supabase service-role client. |
| `src/lib/ai/memory.ts` | dispatcher: added `MEMORY_PROVIDER=pgvector`. |
| `.env.example` | documented the pgvector option + `PGVECTOR_MIN_SIMILARITY`. |
| `notes/pgvector-test/live-test.mts`, `finish-test.mts` | mirror the Mem0 harness (same seeds). |

**No new API key** — reuses `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL`
+ `GOOGLE_GENERATIVE_AI_API_KEY` (the embedding model). `debate.ts` unchanged.

## Parity with the managed systems

| concept | pgvector mapping |
|---|---|
| workflowId / user_id | `council_memories.user_id` (uuid; no FK so benchmarks can use random uuids) |
| agentId | `agent_id` ("twin" for verdicts) |
| scope: "team" | RPC filters by `user_id` only → every persona recalls every persona's memories |
| verbatim write | `formatDebateMemory()` text, embedded + inserted (no extraction) |
| topK = 3, once-per-debate | identical (shared `debate.ts`) |
| relevance | cosine `similarity` (1 - distance), 0–1; `PGVECTOR_MIN_SIMILARITY` floor (default 0) |

## Gotchas

- **Migration must be applied first** — the service-role key can do table/RPC ops
  but **not DDL**, and there's no Supabase CLI or DB connection string in this
  sandbox. So the user applies `20260611000000_council_memories.sql` (Supabase SQL
  editor paste, or `supabase db push` if they have the CLI).
- **Node ≥22 for the scripts** — `@supabase/supabase-js` `createClient` initializes
  a realtime client that needs a global `WebSocket`; node 20.18 lacks it (node 22
  has it stable). Local node 22 at `/tmp/node-v22.11.0-linux-x64/bin`.

## Verification

- `tsc --noEmit` → clean (backend + dispatcher).
- Smoke probe confirmed creds load + `memoryEnabled=true`; the only blocker is the
  missing table (RPC `match_council_memories` not found until the migration runs).

## Blocker → next step

**The Supabase project is currently UNREACHABLE** (discovered during the smoke
run). `google.com` and `supabase.com` resolve, but the project subdomain
`uoudbx***.supabase.co` does **not** resolve (DNS NXDOMAIN; `curl` exit 6, even
with the sandbox disabled). That's the signature of a **paused free-tier project**
— last activity was the May migrations, and idle free projects get auto-paused.
The Gemini embedding call in the same probe succeeded, so the integration is fine;
only Supabase is down.

So the pgvector run needs TWO user actions (neither doable from here):

1. **Restore/unpause the Supabase project** — dashboard → the project → Resume.
2. **Apply the migration** `20260611000000_council_memories.sql` (SQL editor paste,
   or `supabase db push`).

Then run:
   ```bash
   PATH=/tmp/node-v22.11.0-linux-x64/bin:$PATH node --import tsx notes/pgvector-test/live-test.mts
   PATH=/tmp/node-v22.11.0-linux-x64/bin:$PATH node --import tsx notes/pgvector-test/finish-test.mts
   ```
3. Record results into `02-smoke-test.md` + `SUMMARY.md`, comparing against Mem0 +
   AgentMem (does the floor match the managed systems?).
