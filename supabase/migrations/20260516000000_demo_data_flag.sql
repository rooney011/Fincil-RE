-- Phase 10 — Cold-Start Killer
-- Tag rows seeded by "Try with sample data" so the user can wipe them in one click
-- without touching anything they typed by hand.

alter table public.transactions
  add column if not exists is_demo boolean not null default false;

alter table public.savings_goals
  add column if not exists is_demo boolean not null default false;

create index if not exists transactions_user_demo_idx
  on public.transactions (user_id) where is_demo;

create index if not exists savings_goals_user_demo_idx
  on public.savings_goals (user_id) where is_demo;
