-- Appeal post-debate finance snapshot.
-- Stores the recomputed finance verdict at the time of the appeal so that
-- /api/decide can log the correct EMI/cash math even when the user accepts
-- after multiple appeal rounds.

alter table public.appeals
  add column if not exists new_finance_snapshot jsonb;
