-- User-owned interface preferences that should follow an account across devices.
alter table public.profiles
  add column if not exists preferences jsonb not null default '{}'::jsonb;

comment on column public.profiles.preferences is
  'User-owned, non-authoritative application preferences shared across devices.';
