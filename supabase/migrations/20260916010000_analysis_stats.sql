-- Public count of uploaded analyses, for the counter on the Blind review page.
-- Returns numbers only (no names, e-mails or ratings), so it is safe for signed-out visitors.
create or replace function public.analysis_stats()
returns table (analyses bigint, participants bigint, latest timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select count(*), count(distinct user_id), max(created_at) from public.analyses
$$;

revoke all on function public.analysis_stats() from public;
grant execute on function public.analysis_stats() to anon, authenticated;
