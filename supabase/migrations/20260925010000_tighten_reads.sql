-- Close three openings found in a read of the policies on 25 September 2026.
--
-- 1. profiles could be read in full by any signed-in account, e-mail column included, although the
--    site states that e-mail addresses are never shown. A member now reads only their own row;
--    everything the pages need about other members comes from member_directory(), member_answers(),
--    public_answers() and public_answers_main(), which return no e-mail address.
-- 2. live_answers and live_answers_main could likewise be read in full by any signed-in account, so
--    a rater could read another rater's answers before giving their own. A member now reads only
--    their own row, and member_answers() hands out another member's answers only to someone who has
--    already answered at least as much of that sample themselves.
-- 3. site_visits accepted an unbounded number of rows from anyone. A day is capped, and old rows can
--    be pruned by the administrator.
--
-- Nothing in the site's own code read those tables across accounts: every direct read is of the
-- caller's own row.

begin;

-- ---------------------------------------------------------------- 1. profiles
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read own" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_site_admin());

-- ---------------------------------------------------------------- 2. answers
drop policy if exists "live read" on public.live_answers;
create policy "live read own" on public.live_answers for select to authenticated
  using (user_id = auth.uid() or public.is_site_admin());

drop policy if exists "main read" on public.live_answers_main;
create policy "main read own" on public.live_answers_main for select to authenticated
  using (user_id = auth.uid() or public.is_site_admin());

-- A member may compare their work with another member's, but not read it first: a row is returned
-- only to someone whose own rating of that sample is at least as far along.
create or replace function public.member_answers()
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('user_id', p.id, 'participant', p.name, 'country', p.country,
    'profession', p.profession, 'education', p.education, 'author_of', p.author_of,
    'sample', l.sample, 'positions_rated', l.positions_rated, 'rn_answered', l.rn_answered,
    'rows', l.rows, 'updated_at', l.updated_at)
  from public.live_answers l
  join public.profiles p on p.id = l.user_id
  where auth.uid() is not null
    and (l.positions_rated > 0 or l.rn_answered > 0)
    and (
      l.user_id = auth.uid()
      or public.is_site_admin()
      or coalesce((select mine.rn_answered from public.live_answers mine
                   where mine.user_id = auth.uid() and mine.sample = l.sample), 0) >= l.rn_answered
    )
  order by l.updated_at desc
$$;

revoke all on function public.member_answers() from public, anon;
grant execute on function public.member_answers() to authenticated;

-- ---------------------------------------------------------------- 3. the visit log
create or replace function public.site_visits_daily_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare today_rows bigint;
begin
  select count(*) into today_rows from public.site_visits v
   where v.day = ((now() at time zone 'utc')::date);
  if today_rows >= 50000 then
    raise exception 'The visit log is full for today.';
  end if;
  return new;
end $$;

drop trigger if exists site_visits_cap on public.site_visits;
create trigger site_visits_cap before insert on public.site_visits
  for each row execute function public.site_visits_daily_cap();

-- raw rows are not needed once they have been counted; the administrator prunes them
create or replace function public.prune_visits(keep_days integer default 400)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare removed bigint;
begin
  if not public.is_site_admin() then
    raise exception 'Only the site administrator can prune the traffic log.';
  end if;
  delete from public.site_visits
   where day < ((now() at time zone 'utc')::date - greatest(coalesce(keep_days, 400), 1));
  get diagnostics removed = row_count;
  return removed;
end $$;

revoke all on function public.prune_visits(integer) from public, anon;
grant execute on function public.prune_visits(integer) to authenticated;

notify pgrst, 'reload schema';

commit;
