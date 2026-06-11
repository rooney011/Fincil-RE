-- ============================================================
-- council_memories — pgvector baseline for the memory benchmark
-- ============================================================
-- The "floor" system in the memory-systems benchmark (BENCHMARK_TODO.md #2):
-- a plain pgvector table + cosine top-k, no extraction, no dedup, no rerank.
-- If a managed memory system can't beat this on Fincil, it isn't earning its keep.
--
-- Reuses Fincil's existing embedding stack: gemini-embedding-001 @ 768 dims
-- (see src/lib/ai/embeddings.ts), same vector(768) + ivfflat pattern as
-- public.transactions / match_transactions in the init migration.
--
-- NOTE: user_id is uuid but intentionally has NO FK to auth.users, so the
-- benchmark scripts can use synthetic random uuids. In-app it is the Supabase
-- auth user id; RLS (below) still scopes by auth.uid(). The benchmark uses the
-- service role, which bypasses RLS.

create extension if not exists vector;

create table if not exists public.council_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  agent_id text not null default 'twin',
  content text not null,
  embedding vector(768),
  created_at timestamptz not null default now()
);

create index if not exists council_memories_user_created_idx
  on public.council_memories (user_id, created_at desc);

create index if not exists council_memories_embedding_idx
  on public.council_memories
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Vector RPC: match_council_memories
-- Team scope = filter by user_id ONLY (any persona's memory is recallable),
-- mirroring AgentMem's scope:"team" and Mem0's user_id-only search filter.
create or replace function public.match_council_memories(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_user_id uuid
)
returns table (
  id uuid,
  agent_id text,
  content text,
  created_at timestamptz,
  similarity float
)
language sql stable
as $$
  select
    m.id,
    m.agent_id,
    m.content,
    m.created_at,
    1 - (m.embedding <=> query_embedding) as similarity
  from public.council_memories m
  where m.user_id = filter_user_id
    and m.embedding is not null
    and 1 - (m.embedding <=> query_embedding) > match_threshold
  order by m.embedding <=> query_embedding
  limit match_count;
$$;

-- RLS: app users see/write only their own memories. Service role bypasses this.
alter table public.council_memories enable row level security;

create policy "council_memories_own_select" on public.council_memories
  for select using (auth.uid() = user_id);

create policy "council_memories_own_insert" on public.council_memories
  for insert with check (auth.uid() = user_id);
