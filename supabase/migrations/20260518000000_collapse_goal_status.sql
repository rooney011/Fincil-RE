-- Phase 14 — collapse savings_goals.status from a 4-value enum to active|done.
--
-- Mapping rationale:
--   active     → active   (unchanged)
--   paused     → active   (resurface; closing a paused goal silently is worse
--                          than re-exposing it — the user paused, not killed)
--   achieved   → done
--   abandoned  → done
--
-- The check constraint is recreated; the column type stays `text`.

update public.savings_goals set status = 'active' where status = 'paused';
update public.savings_goals set status = 'done'   where status in ('achieved', 'abandoned');

alter table public.savings_goals
  drop constraint if exists savings_goals_status_check;

alter table public.savings_goals
  add constraint savings_goals_status_check
  check (status in ('active', 'done'));
