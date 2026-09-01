-- PAPEL E CÓDIGO — V10B: EQUIPE + CORREÇÕES DA CENTRAL ONLINE
-- Execute DEPOIS de migration-v10-whatsapp-online.sql.
-- Idempotente.

-- Corrige a chave usada pelo backend para evitar mensagem duplicada.
drop index if exists public.whatsapp_messages_user_message_uidx;
create unique index whatsapp_messages_user_message_uidx
on public.whatsapp_messages(user_id, whatsapp_message_id);

-- Equipe: o owner continua sendo o user_id dos dados da empresa.
-- Cada integrante entra com seu próprio usuário do Supabase.
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  member_email text,
  display_name text,
  role text not null default 'attendant'
    check (role in ('admin','manager','attendant','production','finance','viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_user_id, member_user_id)
);

alter table public.team_members enable row level security;

drop policy if exists "team members read" on public.team_members;
create policy "team members read" on public.team_members
for select to authenticated
using (auth.uid() = owner_user_id or auth.uid() = member_user_id);

drop policy if exists "team owner manage" on public.team_members;
create policy "team owner manage" on public.team_members
for all to authenticated
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

-- Compartilha as tabelas da empresa com membros ativos da equipe.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'company_settings','services','leads','investments','sales','cash_movements',
    'customers','products','quotes','quote_items','orders','order_items','production_steps',
    'tasks','art_approvals','suppliers','stock_items','stock_movements','purchase_requests',
    'receivables','payables','automation_rules','audit_logs','whatsapp_threads','whatsapp_messages'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('alter table public.%I enable row level security', t);
      EXECUTE format('drop policy if exists "workspace team access" on public.%I', t);
      EXECUTE format(
        'create policy "workspace team access" on public.%I for all to authenticated using (auth.uid() = user_id or exists (select 1 from public.team_members tm where tm.owner_user_id = user_id and tm.member_user_id = auth.uid() and tm.active = true)) with check (auth.uid() = user_id or exists (select 1 from public.team_members tm where tm.owner_user_id = user_id and tm.member_user_id = auth.uid() and tm.active = true))',
        t
      );
    END IF;
  END LOOP;
END $$;

-- sale_items não possui user_id próprio: herda o acesso da venda.
DO $$
BEGIN
  IF to_regclass('public.sale_items') IS NOT NULL THEN
    alter table public.sale_items enable row level security;
    drop policy if exists "items via workspace team" on public.sale_items;
    create policy "items via workspace team" on public.sale_items
    for all to authenticated
    using (
      exists (
        select 1 from public.sales s
        where s.id = sale_id
          and (
            auth.uid() = s.user_id
            or exists (
              select 1 from public.team_members tm
              where tm.owner_user_id = s.user_id
                and tm.member_user_id = auth.uid()
                and tm.active = true
            )
          )
      )
    )
    with check (
      exists (
        select 1 from public.sales s
        where s.id = sale_id
          and (
            auth.uid() = s.user_id
            or exists (
              select 1 from public.team_members tm
              where tm.owner_user_id = s.user_id
                and tm.member_user_id = auth.uid()
                and tm.active = true
            )
          )
      )
    );
  END IF;
END $$;

create index if not exists team_members_member_active_idx
on public.team_members(member_user_id, active);
create index if not exists team_members_owner_active_idx
on public.team_members(owner_user_id, active);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_team_members_updated_at on public.team_members;
create trigger set_team_members_updated_at
before update on public.team_members
for each row execute function public.set_updated_at();
