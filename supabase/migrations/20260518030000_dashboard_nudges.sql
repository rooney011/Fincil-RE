-- Phase 12 — Engagement Loop (slice a)
-- Cache the weekly Miser nudge so we don't regenerate it on every dashboard
-- load. One nudge per user per ISO-week.

create table if not exists public.dashboard_nudges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_starts_on date not null,
  kind text not null check (kind in ('low_surplus', 'category_spike')),
  message text not null,
  created_at timestamptz not null default now(),
  unique (user_id, week_starts_on)
);

create index if not exists dashboard_nudges_user_week_idx
  on public.dashboard_nudges (user_id, week_starts_on);

alter table public.dashboard_nudges enable row level security;

create policy "dashboard_nudges_select_own"
  on public.dashboard_nudges for select using (auth.uid() = user_id);
create policy "dashboard_nudges_insert_own"
  on public.dashboard_nudges for insert with check (auth.uid() = user_id);
create policy "dashboard_nudges_delete_own"
  on public.dashboard_nudges for delete using (auth.uid() = user_id);
