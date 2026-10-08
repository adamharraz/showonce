-- Run once in the Supabase SQL editor. Disable public Auth signups in the dashboard.
create table if not exists public.showonce_records (
  id text primary key,
  kind text not null,
  owner_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists showonce_kind_owner on public.showonce_records(kind, owner_id);
alter table public.showonce_records enable row level security;
-- No browser policies: only the backend service role can read or write records.
revoke all on public.showonce_records from anon, authenticated;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('showonce', 'showonce', false, 1000000, array['image/jpeg'])
on conflict (id) do update set public = false;
