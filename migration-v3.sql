-- MIGRAÇÃO V3 — Papel e Código
-- Execute UMA VEZ no SQL Editor do Supabase.
-- É idempotente: pode ser executada novamente com segurança.

-- Compatibilidade com a versão de caixa contínuo
alter table public.sales alter column cash_session_id drop not null;
alter table public.cash_movements alter column cash_session_id drop not null;
alter table public.sales add column if not exists seller_name text;
alter table public.sales add column if not exists customer_phone text;
alter table public.sale_items add column if not exists unit_cost numeric(12,2) not null default 0;
alter table public.sale_items add column if not exists service_id uuid;
alter table public.cash_movements add column if not exists nature text not null default 'operational';
alter table public.cash_movements add column if not exists category text;

alter table public.sales drop constraint if exists sales_seller_name_check;
alter table public.sales add constraint sales_seller_name_check
check (seller_name is null or seller_name in ('IGOR','JHONATAN','BEATRIZ'));

-- Configurações da empresa
create table if not exists public.company_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trade_name text default 'Papel e Código',
  legal_name text,
  cnpj text,
  state_registration text,
  address text,
  city text,
  state text,
  zip_code text,
  phone text,
  whatsapp text,
  email text,
  instagram text,
  website text,
  pix_key text,
  receipt_footer text default 'Obrigado pela preferência. Onde sua marca acontece.',
  monthly_revenue_target numeric(12,2) not null default 0,
  tax_rate numeric(7,4) not null default 0,
  updated_at timestamptz not null default now()
);

-- Serviços / produtos
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text,
  sale_price numeric(12,2) not null default 0 check (sale_price >= 0),
  direct_cost numeric(12,2) not null default 0 check (direct_cost >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Funil comercial
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_name text not null,
  customer_phone text,
  service_interest text,
  estimated_value numeric(12,2) not null default 0,
  stage text not null default 'novo' check (stage in ('novo','orcamento','aguardando','aprovado','producao','pronto','entregue')),
  seller_name text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Investimentos / máquinas
create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  total_value numeric(12,2) not null default 0,
  installment_value numeric(12,2) not null default 0,
  total_installments integer not null default 1 check (total_installments > 0),
  paid_installments integer not null default 0 check (paid_installments >= 0),
  purchase_date date,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- FK opcional do item para serviço
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_items_service_id_fkey'
  ) THEN
    ALTER TABLE public.sale_items
      ADD CONSTRAINT sale_items_service_id_fkey
      FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE SET NULL;
  END IF;
END $$;

-- RLS
alter table public.company_settings enable row level security;
alter table public.services enable row level security;
alter table public.leads enable row level security;
alter table public.investments enable row level security;

drop policy if exists "settings own" on public.company_settings;
create policy "settings own" on public.company_settings for all to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "services own" on public.services;
create policy "services own" on public.services for all to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "leads own" on public.leads;
create policy "leads own" on public.leads for all to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "investments own" on public.investments;
create policy "investments own" on public.investments for all to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists services_user_active_idx on public.services(user_id,active,name);
create index if not exists leads_user_stage_idx on public.leads(user_id,stage,updated_at desc);
create index if not exists investments_user_active_idx on public.investments(user_id,active);
create index if not exists sales_seller_created_idx on public.sales(seller_name,created_at desc);
create index if not exists movements_user_created_idx on public.cash_movements(user_id,created_at desc);
