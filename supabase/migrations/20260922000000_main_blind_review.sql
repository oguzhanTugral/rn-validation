-- The main blind review keeps its answers apart from the training round: one row per participant,
-- the same shape and the same rules as live_answers. Its public read-out leaves the e-mail out and
-- names an author of one of the analysers, so the pooled figures can leave authors out.

create table if not exists public.live_answers_main (
  user_id          uuid primary key default auth.uid() references public.profiles (id),
  corpus           text not null,
  sample           text not null,
  positions_rated  integer not null default 0,
  rn_answered      integer not null default 0,
  rows             jsonb not null default '{}'::jsonb check (jsonb_typeof(rows) = 'object'),
  updated_at       timestamptz not null default now()
);

alter table public.live_answers_main enable row level security;

drop policy if exists "main read" on public.live_answers_main;
create policy "main read" on public.live_answers_main for select to authenticated using (true);

drop policy if exists "main insert own" on public.live_answers_main;
create policy "main insert own" on public.live_answers_main for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "main update own" on public.live_answers_main;
create policy "main update own" on public.live_answers_main for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.live_answers_main from anon;
grant select, insert, update on public.live_answers_main to authenticated;

create or replace function public.public_answers_main()
returns table (participant text, country text, profession text, education text, author_of text, sample text,
               positions_rated integer, rn_answered integer, rows jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.name, p.country, p.profession, p.education, p.author_of, l.sample, l.positions_rated, l.rn_answered,
         l.rows, l.updated_at
  from public.live_answers_main l
  join public.profiles p on p.id = l.user_id
  where l.positions_rated > 0 or l.rn_answered > 0
  order by l.updated_at desc
$$;

revoke all on function public.public_answers_main() from public;
grant execute on function public.public_answers_main() to anon, authenticated;
