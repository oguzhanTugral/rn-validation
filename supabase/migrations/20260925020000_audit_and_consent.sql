-- Two additions.
--
-- 1. admin_audit: what the administrator changed, when, and from which account. The only thing an
--    administrator can change that every visitor sees is which rating the pages report, so that
--    change is recorded by a trigger rather than left to good faith. Rows are written by the
--    trigger alone; nobody can insert, update or delete them through the API.
-- 2. profiles.consent_at: when this participant agreed to the terms shown before rating. The
--    review pages ask before the first rating and write the time here; it is the participant's own
--    row, so no new write permission is needed.

begin;

create table if not exists public.admin_audit (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  actor        uuid references public.profiles (id),
  actor_email  text not null default '',
  action       text not null,
  detail       jsonb not null default '{}'::jsonb
);

alter table public.admin_audit enable row level security;

drop policy if exists "audit read admin" on public.admin_audit;
create policy "audit read admin" on public.admin_audit for select to authenticated
  using (public.is_site_admin());

revoke all on public.admin_audit from anon, authenticated;
grant select on public.admin_audit to authenticated;      -- no insert, update or delete for anyone

create or replace function public.record_settings_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.admin_audit (actor, actor_email, action, detail)
  values (auth.uid(),
          coalesce((select u.email from auth.users u where u.id = auth.uid()), ''),
          'site_settings.' || new.key,
          jsonb_build_object('value', new.value,
                             'was', case when tg_op = 'UPDATE' then old.value else null end));
  return new;
end $$;

drop trigger if exists site_settings_audit on public.site_settings;
create trigger site_settings_audit after insert or update on public.site_settings
  for each row execute function public.record_settings_change();

-- ---------------------------------------------------------------- consent
alter table public.profiles add column if not exists consent_at timestamptz;

notify pgrst, 'reload schema';

commit;
