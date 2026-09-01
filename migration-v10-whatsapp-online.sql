-- PAPEL E CÓDIGO — CENTRAL ONLINE DE ATENDIMENTO V10
-- Execute uma vez no SQL Editor do Supabase.
-- Cria conversas, mensagens, mídia e configuração do servidor WhatsApp.

create extension if not exists pgcrypto;

alter table if exists public.company_settings
  add column if not exists whatsapp_api_url text;

alter table if exists public.customers
  add column if not exists phone_digits text;

update public.customers
set phone_digits = regexp_replace(coalesce(whatsapp, phone, ''), '\D', '', 'g')
where coalesce(phone_digits,'') = '';

create or replace function public.sync_customer_phone_digits()
returns trigger language plpgsql as $$
begin
  new.phone_digits := regexp_replace(coalesce(new.whatsapp, new.phone, ''), '\D', '', 'g');
  return new;
end;
$$;

drop trigger if exists trg_customer_phone_digits on public.customers;
create trigger trg_customer_phone_digits
before insert or update of phone, whatsapp on public.customers
for each row execute function public.sync_customer_phone_digits();

create index if not exists customers_user_phone_digits_idx
on public.customers(user_id, phone_digits);

create table if not exists public.whatsapp_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  whatsapp_chat_id text not null,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid,
  customer_name text,
  phone text,
  status text not null default 'open' check (status in ('open','waiting','closed')),
  assigned_to text,
  unread_count integer not null default 0,
  last_message text,
  last_message_type text,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, whatsapp_chat_id)
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.whatsapp_threads(id) on delete cascade,
  whatsapp_message_id text,
  direction text not null check (direction in ('in','out')),
  sender_name text,
  sender_phone text,
  body text,
  message_type text not null default 'text',
  media_path text,
  media_name text,
  mime_type text,
  file_size bigint,
  sent_by_auth_user uuid,
  sent_by_name text,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists whatsapp_messages_user_message_uidx
on public.whatsapp_messages(user_id, whatsapp_message_id)
where whatsapp_message_id is not null;

create index if not exists whatsapp_threads_user_last_idx
on public.whatsapp_threads(user_id, last_message_at desc);
create index if not exists whatsapp_messages_thread_created_idx
on public.whatsapp_messages(thread_id, created_at);

alter table public.whatsapp_threads enable row level security;
alter table public.whatsapp_messages enable row level security;

drop policy if exists "whatsapp_threads own" on public.whatsapp_threads;
create policy "whatsapp_threads own" on public.whatsapp_threads
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "whatsapp_messages own" on public.whatsapp_messages;
create policy "whatsapp_messages own" on public.whatsapp_messages
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Bucket privado para fotos, PDFs, áudios e outros anexos.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'whatsapp-media',
  'whatsapp-media',
  false,
  26214400,
  array[
    'image/jpeg','image/png','image/webp','image/gif',
    'application/pdf',
    'audio/ogg','audio/opus','audio/mpeg','audio/mp4','audio/webm',
    'video/mp4','application/octet-stream'
  ]
)
on conflict (id) do update
set public=false, file_size_limit=26214400;

alter table public.whatsapp_threads replica identity full;
alter table public.whatsapp_messages replica identity full;

DO $$
BEGIN
  IF NOT EXISTS (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='whatsapp_threads'
  ) THEN
    alter publication supabase_realtime add table public.whatsapp_threads;
  END IF;
  IF NOT EXISTS (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='whatsapp_messages'
  ) THEN
    alter publication supabase_realtime add table public.whatsapp_messages;
  END IF;
END $$;

-- Mantém updated_at dos atendimentos.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_whatsapp_threads_updated_at on public.whatsapp_threads;
create trigger set_whatsapp_threads_updated_at
before update on public.whatsapp_threads
for each row execute function public.set_updated_at();
