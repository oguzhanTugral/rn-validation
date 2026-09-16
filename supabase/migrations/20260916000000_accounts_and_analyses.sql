-- Participant accounts and uploaded blind-review analyses.
-- Sign-in itself is Supabase Auth (e-mailed one-time code, then the participant's own password).
-- Row-level security: a participant can write only their own profile and add only their own
-- analyses; analyses can never be changed or deleted; only signed-in users can read.

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  name        text not null default '',
  country     text not null default '',
  profession  text not null default '',
  education   text not null default '',
  updated_at  timestamptz not null default now()
);

create table if not exists public.analyses (
  id               bigint generated always as identity primary key,
  analysis_code    text not null unique,
  user_id          uuid not null default auth.uid() references public.profiles (id),
  corpus           text not null,
  sample           text not null,
  positions_rated  integer not null check (positions_rated > 0),
  payload          jsonb not null check (jsonb_typeof(payload -> 'rows') = 'object'),
  created_at       timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.analyses enable row level security;

-- profiles: signed-in users can read (names appear on Compare); each writes only their own row,
-- and the e-mail must be the account's own e-mail
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (true);

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles for insert to authenticated
  with check (id = auth.uid() and email = (auth.jwt() ->> 'email'));

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and email = (auth.jwt() ->> 'email'));

-- analyses: signed-in users can read all; each adds only their own; no update, no delete policy,
-- so an uploaded analysis stays exactly as it was submitted
drop policy if exists "analyses read" on public.analyses;
create policy "analyses read" on public.analyses for select to authenticated using (true);

drop policy if exists "analyses insert own" on public.analyses;
create policy "analyses insert own" on public.analyses for insert to authenticated
  with check (user_id = auth.uid());

revoke all on public.profiles, public.analyses from anon;
grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.analyses to authenticated;
