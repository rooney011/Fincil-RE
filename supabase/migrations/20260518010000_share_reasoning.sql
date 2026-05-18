-- Phase 11 — Shareable verdict cards
-- Persist the Twin's reasoning so /share/[sessionId] can show the verdict in
-- full. Existing rows stay NULL; the share page falls back to "no reasoning
-- captured" for legacy debates.

alter table public.council_sessions
  add column if not exists reasoning text;

alter table public.appeals
  add column if not exists reasoning text;
