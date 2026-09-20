begin;

-- Member-only identities, without account e-mail addresses.
create function public.member_directory()
returns table (id uuid, name text, author_of text)
language sql stable security definer set search_path = public as $$
  select id, name, author_of from public.profiles
  where auth.uid() is not null order by name, id
$$;
revoke all on function public.member_directory() from public, anon;
grant execute on function public.member_directory() to authenticated;

create function public.member_answers()
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('user_id', p.id, 'participant', p.name, 'country', p.country,
    'profession', p.profession, 'education', p.education, 'author_of', p.author_of,
    'sample', l.sample, 'positions_rated', l.positions_rated, 'rn_answered', l.rn_answered,
    'rows', l.rows, 'updated_at', l.updated_at)
  from public.live_answers l join public.profiles p on p.id = l.user_id
  where auth.uid() is not null and (l.positions_rated > 0 or l.rn_answered > 0)
  order by l.updated_at desc
$$;
revoke all on function public.member_answers() from public, anon;
grant execute on function public.member_answers() to authenticated;

create table public.rn_feedback (
  target_id uuid not null references public.profiles(id),
  sample text not null,
  position_id text not null,
  reviewer_id uuid not null default auth.uid() references public.profiles(id),
  stars integer check (stars between 1 and 5),
  comment text not null default '' check (length(comment) <= 2000),
  answer_snapshot jsonb not null check (jsonb_typeof(answer_snapshot) = 'object'),
  updated_at timestamptz not null default now(),
  primary key(target_id, sample, position_id, reviewer_id),
  check (stars is not null or length(btrim(comment)) > 0),
  check (target_id <> reviewer_id or stars is null)
);
alter table public.rn_feedback enable row level security;
revoke all on public.rn_feedback from public, anon, authenticated;
grant select, insert, update on public.rn_feedback to authenticated;
create policy "members read feedback" on public.rn_feedback for select to authenticated using (true);
create policy "members insert own feedback" on public.rn_feedback for insert to authenticated
  with check (reviewer_id = auth.uid());
create policy "members update own feedback" on public.rn_feedback for update to authenticated
  using (reviewer_id = auth.uid()) with check (reviewer_id = auth.uid());

-- Validate the current answer so feedback cannot silently attach to another sample/revision.
create function public.validate_rn_feedback() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists(select 1 from public.live_answers l where l.user_id = new.target_id
    and l.sample = new.sample and l.rows -> new.position_id = new.answer_snapshot
    and l.rows -> new.position_id ->> 'rnDone' = 'true') then
    raise exception 'This answer has changed or is not confirmed. Reload the analysis before reviewing it.';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.validate_rn_feedback() from public, anon, authenticated;
create trigger validate_rn_feedback before insert or update on public.rn_feedback
  for each row execute function public.validate_rn_feedback();

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null default auth.uid() references public.profiles(id),
  recipient_id uuid not null references public.profiles(id),
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  check(sender_id <> recipient_id)
);
create index direct_messages_sender_time on public.direct_messages(sender_id, created_at desc);
create index direct_messages_recipient_time on public.direct_messages(recipient_id, created_at desc);
alter table public.direct_messages enable row level security;
revoke all on public.direct_messages from public, anon, authenticated;
grant select on public.direct_messages to authenticated;
grant insert(id, sender_id, recipient_id, body) on public.direct_messages to authenticated;
create policy "conversation participants read" on public.direct_messages for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);
create policy "send as yourself" on public.direct_messages for insert to authenticated
  with check (auth.uid() = sender_id);

notify pgrst, 'reload schema';
commit;
