-- Keep the authenticated account auditable while allowing a founder to test
-- application behavior as a synthetic participant.
alter table public.discussion_messages
  add column if not exists authenticated_by uuid default auth.uid();

update public.discussion_messages
set authenticated_by = author_id
where authenticated_by is null;

alter table public.discussion_messages
  alter column authenticated_by set not null;

drop policy if exists discussion_messages_author_insert on public.discussion_messages;
create policy discussion_messages_author_insert
  on public.discussion_messages for insert to authenticated
  with check ((select auth.uid()) = authenticated_by);

drop policy if exists discussion_messages_author_update on public.discussion_messages;
create policy discussion_messages_author_update
  on public.discussion_messages for update to authenticated
  using ((select auth.uid()) = authenticated_by)
  with check ((select auth.uid()) = authenticated_by);

drop policy if exists discussion_messages_author_delete on public.discussion_messages;
create policy discussion_messages_author_delete
  on public.discussion_messages for delete to authenticated
  using ((select auth.uid()) = authenticated_by);

create or replace view public.discussion_messages_view
with (security_invoker = true)
as
select
  message.id,
  message.context_type,
  message.context_id,
  message.author_id,
  coalesce(directory.display_name, message.author_id::text) as author_name,
  message.body,
  message.created_at,
  message.updated_at
from public.discussion_messages message
left join public.participant_directory directory on directory.id = message.author_id;

revoke all on public.discussion_messages_view from anon;
grant select on public.discussion_messages_view to authenticated;
