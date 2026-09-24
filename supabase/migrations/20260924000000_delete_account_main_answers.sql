begin;
-- The supplied identity is confirmation only, never the deletion target.
create or replace function public.delete_own_account(confirm_email text, confirm_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null or owner_id is distinct from confirm_user_id then
    raise exception 'Account changed. Sign in again before deleting.';
  end if;
  perform 1 from auth.users where id = owner_id
    and lower(email) = lower(btrim(confirm_email)) for update;
  if not found then raise exception 'Type the email address of the signed-in account.'; end if;
  delete from public.direct_messages where sender_id = owner_id or recipient_id = owner_id;
  delete from public.rn_feedback where reviewer_id = owner_id or target_id = owner_id;
  delete from public.live_answers_main where user_id = owner_id;
  delete from public.live_answers where user_id = owner_id;
  delete from public.analyses where user_id = owner_id;
  delete from public.profiles where id = owner_id;
  delete from auth.users where id = owner_id;
end $$;
revoke all on function public.delete_own_account(text,uuid) from public, anon;
grant execute on function public.delete_own_account(text,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
