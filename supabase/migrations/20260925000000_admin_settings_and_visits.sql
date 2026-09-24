-- Two things only the site administrator can do, and one thing every visitor contributes to.
--
-- 1. site_settings: which rating the pages report. The administrator ticks it once and every
--    visitor sees that choice; nobody else can write the row.
-- 2. site_visits: one row per page view, with no address, no cookie and no identifier of the
--    visitor: the date, the page, the referring site's host, the browser language and the browser
--    time zone. Only the administrator can read them, and only as daily totals.
--
-- The administrator is the account whose e-mail is oguzhantugral@gmail.com.

begin;

create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    lower((select u.email from auth.users u where u.id = auth.uid())) = 'oguzhantugral@gmail.com',
    false)
$$;

revoke all on function public.is_site_admin() from public, anon;
grant execute on function public.is_site_admin() to authenticated;

-- ---------------------------------------------------------------- what the pages report
create table if not exists public.site_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.site_settings enable row level security;

drop policy if exists "settings read" on public.site_settings;
create policy "settings read" on public.site_settings for select to anon, authenticated using (true);

drop policy if exists "settings insert admin" on public.site_settings;
create policy "settings insert admin" on public.site_settings for insert to authenticated
  with check (public.is_site_admin());

drop policy if exists "settings update admin" on public.site_settings;
create policy "settings update admin" on public.site_settings for update to authenticated
  using (public.is_site_admin()) with check (public.is_site_admin());

grant select on public.site_settings to anon, authenticated;
grant insert, update on public.site_settings to authenticated;

insert into public.site_settings (key, value)
values ('figures', jsonb_build_object('source', 'published'))
on conflict (key) do nothing;

-- ---------------------------------------------------------------- daily traffic
create table if not exists public.site_visits (
  id          bigint generated always as identity primary key,
  day         date not null default ((now() at time zone 'utc')::date),
  path        text not null,
  ref_host    text not null default '',
  lang        text not null default '',
  tz          text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists site_visits_day_idx on public.site_visits (day);

alter table public.site_visits enable row level security;

-- a visit may be recorded by anyone, but only within these shapes, and nothing else may be written
drop policy if exists "visits insert" on public.site_visits;
create policy "visits insert" on public.site_visits for insert to anon, authenticated
  with check (
    length(path) between 1 and 120
    and length(ref_host) <= 120
    and length(lang) <= 20
    and length(tz) <= 60
    and day = ((now() at time zone 'utc')::date)
  );

drop policy if exists "visits read admin" on public.site_visits;
create policy "visits read admin" on public.site_visits for select to authenticated
  using (public.is_site_admin());

revoke all on public.site_visits from anon, authenticated;
grant insert on public.site_visits to anon, authenticated;
grant select on public.site_visits to authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- daily totals for the administrator; raises for anyone else
create or replace function public.visit_daily(days integer default 30)
returns table (day date, visits bigint, pages jsonb, referrers jsonb, zones jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_site_admin() then
    raise exception 'Only the site administrator can read the traffic log.';
  end if;
  return query
  with recent as (
    select v.day, v.path, coalesce(nullif(v.ref_host, ''), 'direct') as ref, coalesce(nullif(v.tz, ''), 'unknown') as zone
    from public.site_visits v
    where v.day > ((now() at time zone 'utc')::date - greatest(coalesce(days, 30), 1))
  )
  select r.day,
         count(*)::bigint as visits,
         (select jsonb_object_agg(x.path, x.n) from (
            select r2.path, count(*) as n from recent r2 where r2.day = r.day
            group by r2.path order by count(*) desc limit 12) x) as pages,
         (select jsonb_object_agg(x.ref, x.n) from (
            select r2.ref, count(*) as n from recent r2 where r2.day = r.day
            group by r2.ref order by count(*) desc limit 12) x) as referrers,
         (select jsonb_object_agg(x.zone, x.n) from (
            select r2.zone, count(*) as n from recent r2 where r2.day = r.day
            group by r2.zone order by count(*) desc limit 12) x) as zones
  from recent r
  group by r.day
  order by r.day desc;
end $$;

revoke all on function public.visit_daily(integer) from public, anon;
grant execute on function public.visit_daily(integer) to authenticated;

notify pgrst, 'reload schema';

commit;
