-- A participant may declare themselves an author of one of the analysers. Author answers stay visible and are
-- labelled publicly ("Author of musWM"), but are left out of the pooled figures, because an author rating their
-- own analyser is not independent.

alter table public.profiles
  add column if not exists author_of text
  check (author_of is null or author_of in ('musWM', 'AnalysisGNN', 'AugmentedNet'));

-- the public read-out carries the label too
create or replace function public.public_answers()
returns table (participant text, country text, profession text, education text, author_of text, sample text,
               positions_rated integer, rn_answered integer, rows jsonb, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.name, p.country, p.profession, p.education, p.author_of, l.sample, l.positions_rated, l.rn_answered,
         l.rows, l.updated_at
  from public.live_answers l
  join public.profiles p on p.id = l.user_id
  where l.positions_rated > 0 or l.rn_answered > 0
  order by l.updated_at desc
$$;

revoke all on function public.public_answers() from public;
grant execute on function public.public_answers() to anon, authenticated;
