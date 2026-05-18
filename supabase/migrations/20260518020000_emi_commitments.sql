-- Phase 13 — EMI expiration & data hygiene
--
-- Problem we're fixing:
--   /api/decide bumps profiles.monthly_expenses every time an EMI is accepted.
--   The bump is permanent — it never decays when the 12-month EMI ends — so a
--   user who accepts a few EMIs over a year sees their "monthly expenses"
--   silently drift upwards forever, breaking every future surplus calc.
--
-- The fix:
--   - Track each EMI bump as its own row in emi_commitments.
--   - Each row carries expires_at = started_at + 12 months.
--   - Add profiles.baseline_monthly_expenses so we can always recompute
--     the live monthly_expenses as baseline + sum(active commitments).
--   - The decide route still updates profiles.monthly_expenses as a cached
--     total; lazy expiry passes at debate-time keep it honest.

create table if not exists public.emi_commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.council_sessions(id) on delete set null,
  monthly_amount numeric(12,2) not null check (monthly_amount > 0),
  started_at date not null default current_date,
  expires_at date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists emi_commitments_user_active_idx
  on public.emi_commitments (user_id) where active;

create index if not exists emi_commitments_user_expires_idx
  on public.emi_commitments (user_id, expires_at) where active;

alter table public.emi_commitments enable row level security;

create policy "emi_commitments_select_own"
  on public.emi_commitments for select using (auth.uid() = user_id);
create policy "emi_commitments_insert_own"
  on public.emi_commitments for insert with check (auth.uid() = user_id);
create policy "emi_commitments_update_own"
  on public.emi_commitments for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "emi_commitments_delete_own"
  on public.emi_commitments for delete using (auth.uid() = user_id);

-- profiles.baseline_monthly_expenses: the user-entered recurring figure that
-- never changes from EMI accepts. Backfilled from the current monthly_expenses
-- so existing users see no change (their bumps are already baked in).
alter table public.profiles
  add column if not exists baseline_monthly_expenses numeric(12,2);

update public.profiles
  set baseline_monthly_expenses = monthly_expenses
  where baseline_monthly_expenses is null;

alter table public.profiles
  alter column baseline_monthly_expenses set not null;

alter table public.profiles
  alter column baseline_monthly_expenses set default 0;
