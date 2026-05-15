-- Fincil v2 — initial schema
-- See REMASTER_PLAN.md §5 for the design rationale.

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists vector;

-- ============================================================
-- Tables
-- ============================================================

-- 1. profiles ------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null check (role in ('student','freelancer','employee','business','general')),
  monthly_income numeric(12,2) not null default 0,
  monthly_expenses numeric(12,2) not null default 0,
  income_type text not null check (income_type in ('fixed','variable')),
  risk_tolerance text not null check (risk_tolerance in ('low','medium','high')),
  financial_goal text,
  currency text not null default 'INR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. transactions --------------------------------------------
-- amount: negative = outflow, positive = inflow
-- embedding: 768-dim from Gemini text-embedding-004
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null,
  description text not null,
  category text not null,
  source text not null check (source in ('manual','council','adjustment')) default 'manual',
  occurred_at timestamptz not null default now(),
  embedding vector(768),
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_occurred_idx
  on public.transactions (user_id, occurred_at desc);

create index if not exists transactions_embedding_idx
  on public.transactions
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- 3. council_sessions ----------------------------------------
create table if not exists public.council_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  amount numeric(12,2) not null,
  category text,
  verdict text check (verdict in ('approved','rejected','pending')),
  transcript jsonb not null default '[]'::jsonb,
  finance_snapshot jsonb not null,
  decision text check (decision in ('accepted','declined','appealed','negotiated')),
  created_at timestamptz not null default now()
);

create index if not exists council_sessions_user_created_idx
  on public.council_sessions (user_id, created_at desc);

-- 4. appeals -------------------------------------------------
create table if not exists public.appeals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.council_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  round int not null,
  appeal_text text not null,
  extracted_income numeric(12,2),
  extracted_income_confidence text check (
    extracted_income_confidence in ('high','medium','low','none')
  ),
  extracted_income_recurring boolean,
  new_transcript jsonb not null,
  new_verdict text not null check (new_verdict in ('approved','rejected')),
  created_at timestamptz not null default now()
);

create index if not exists appeals_session_round_idx
  on public.appeals (session_id, round);

-- 5. savings_goals -------------------------------------------
create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(12,2) not null check (target_amount > 0),
  current_amount numeric(12,2) not null default 0,
  target_date date,
  priority text not null check (priority in ('low','medium','high')) default 'medium',
  status text not null check (status in ('active','paused','achieved','abandoned')) default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists savings_goals_user_status_idx
  on public.savings_goals (user_id, status);

-- ============================================================
-- updated_at trigger (applied to profiles + savings_goals)
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists savings_goals_set_updated_at on public.savings_goals;
create trigger savings_goals_set_updated_at
  before update on public.savings_goals
  for each row execute function public.set_updated_at();

-- ============================================================
-- Vector RPC: match_transactions
-- ============================================================
create or replace function public.match_transactions(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_user_id uuid
)
returns table (
  id uuid,
  description text,
  amount numeric,
  category text,
  occurred_at timestamptz,
  similarity float
)
language sql stable
as $$
  select
    t.id,
    t.description,
    t.amount,
    t.category,
    t.occurred_at,
    1 - (t.embedding <=> query_embedding) as similarity
  from public.transactions t
  where t.user_id = filter_user_id
    and t.embedding is not null
    and 1 - (t.embedding <=> query_embedding) > match_threshold
  order by t.embedding <=> query_embedding
  limit match_count;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles         enable row level security;
alter table public.transactions     enable row level security;
alter table public.council_sessions enable row level security;
alter table public.appeals          enable row level security;
alter table public.savings_goals    enable row level security;

-- profiles: own row only
create policy "profiles_select_own"   on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own"   on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own"   on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_delete_own"   on public.profiles for delete using (auth.uid() = id);

-- transactions
create policy "tx_select_own"   on public.transactions for select using (auth.uid() = user_id);
create policy "tx_insert_own"   on public.transactions for insert with check (auth.uid() = user_id);
create policy "tx_update_own"   on public.transactions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tx_delete_own"   on public.transactions for delete using (auth.uid() = user_id);

-- council_sessions
create policy "cs_select_own"   on public.council_sessions for select using (auth.uid() = user_id);
create policy "cs_insert_own"   on public.council_sessions for insert with check (auth.uid() = user_id);
create policy "cs_update_own"   on public.council_sessions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- appeals
create policy "appeals_select_own"   on public.appeals for select using (auth.uid() = user_id);
create policy "appeals_insert_own"   on public.appeals for insert with check (auth.uid() = user_id);

-- savings_goals
create policy "goals_select_own"   on public.savings_goals for select using (auth.uid() = user_id);
create policy "goals_insert_own"   on public.savings_goals for insert with check (auth.uid() = user_id);
create policy "goals_update_own"   on public.savings_goals for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "goals_delete_own"   on public.savings_goals for delete using (auth.uid() = user_id);
