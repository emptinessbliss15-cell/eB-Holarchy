create table if not exists public.discussion_messages (
  id uuid primary key default gen_random_uuid(),
  context_type text not null check (context_type in ('channel', 'holon', 'provenance')),
  context_id text not null check (length(btrim(context_id)) > 0),
  author_id uuid not null default auth.uid(),
  body text not null check (length(btrim(body)) > 0 and char_length(body) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists discussion_messages_context_created_idx
  on public.discussion_messages (context_type, context_id, created_at);

alter table public.discussion_messages enable row level security;

drop policy if exists discussion_messages_authenticated_read on public.discussion_messages;
create policy discussion_messages_authenticated_read
  on public.discussion_messages for select to authenticated using (true);
drop policy if exists discussion_messages_author_insert on public.discussion_messages;
create policy discussion_messages_author_insert
  on public.discussion_messages for insert to authenticated
  with check ((select auth.uid()) = author_id);
drop policy if exists discussion_messages_author_update on public.discussion_messages;
create policy discussion_messages_author_update
  on public.discussion_messages for update to authenticated
  using ((select auth.uid()) = author_id)
  with check ((select auth.uid()) = author_id);
drop policy if exists discussion_messages_author_delete on public.discussion_messages;
create policy discussion_messages_author_delete
  on public.discussion_messages for delete to authenticated
  using ((select auth.uid()) = author_id);

revoke all on public.discussion_messages from anon;
grant select, insert, update, delete on public.discussion_messages to authenticated;

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

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'discussion_messages'
  ) then
    alter publication supabase_realtime add table public.discussion_messages;
  end if;
end $$;
