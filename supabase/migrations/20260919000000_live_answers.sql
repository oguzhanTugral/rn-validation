-- Each participant's current answers, saved automatically while they work (one row per participant).
-- A participant can create and update only their own row; signed-in users can read all rows (for the
-- pooled percentages on the Compare page); nobody can delete. Snapshot uploads stay in public.analyses.

create table if not exists public.live_answers (
  user_id          uuid primary key default auth.uid() references public.profiles (id),
  corpus           text not null,
  sample           text not null,
  positions_rated  integer not null default 0,
  rn_answered      integer not null default 0,
  rows             jsonb not null default '{}'::jsonb check (jsonb_typeof(rows) = 'object'),
  updated_at       timestamptz not null default now()
);

alter table public.live_answers enable row level security;

drop policy if exists "live read" on public.live_answers;
create policy "live read" on public.live_answers for select to authenticated using (true);

drop policy if exists "live insert own" on public.live_answers;
create policy "live insert own" on public.live_answers for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "live update own" on public.live_answers;
create policy "live update own" on public.live_answers for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.live_answers from anon;
grant select, insert, update on public.live_answers to authenticated;

-- The public counter now counts participants with saved answers (numbers only, no names or answers).
create or replace function public.analysis_stats()
returns table (analyses bigint, participants bigint, latest timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select count(*) filter (where positions_rated > 0 or rn_answered > 0),
         count(*),
         max(updated_at)
  from public.live_answers
$$;

revoke all on function public.analysis_stats() from public;
grant execute on function public.analysis_stats() to anon, authenticated;
