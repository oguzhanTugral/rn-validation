-- Public read-out of every participant's saved answers for the Compare page (no sign-in needed).
-- Returns name, country, profession, education and the answers; the e-mail is NOT included.
-- The tables themselves stay closed to signed-out visitors.
create or replace function public.public_answers()
returns table (participant text, country text, profession text, education text, sample text,
               positions_rated integer, rn_answered integer, rows jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.name, p.country, p.profession, p.education, l.sample, l.positions_rated, l.rn_answered, l.rows, l.updated_at
  from public.live_answers l
  join public.profiles p on p.id = l.user_id
  where l.positions_rated > 0 or l.rn_answered > 0
  order by l.updated_at desc
$$;

revoke all on function public.public_answers() from public;
grant execute on function public.public_answers() to anon, authenticated;
