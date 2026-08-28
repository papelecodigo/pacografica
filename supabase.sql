-- Schema base do Caixa Papel e Código — V2
-- Para um projeto NOVO, execute este arquivo no SQL Editor do Supabase.
-- Para o projeto atual já configurado, execute migration-v2.sql em vez deste arquivo.

create extension if not exists pgcrypto;

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  seller_name text check (seller_name is null or seller_name in ('IGOR','JHONATAN','BEATRIZ')),
  customer_name text,
  customer_phone text,
  note text,
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  total numeric(12,2) not null check (total > 0),
  payment_method text not null check (payment_method in ('pix','dinheiro','debito','credito','outro')),
  created_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  description text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  total numeric(12,2) not null check (total >= 0)
);

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('entrada','saida')),
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.cash_movements enable row level security;

drop policy if exists "sales own" on public.sales;
create policy "sales own" on public.sales for all to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "movements own" on public.cash_movements;
create policy "movements own" on public.cash_movements for all to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "items via own sale" on public.sale_items;
create policy "items via own sale" on public.sale_items for all to authenticated
using (exists(select 1 from public.sales s where s.id = sale_id and s.user_id = auth.uid()))
with check (exists(select 1 from public.sales s where s.id = sale_id and s.user_id = auth.uid()));

create index if not exists sales_user_created_idx on public.sales(user_id,created_at desc);
create index if not exists sales_seller_created_idx on public.sales(seller_name,created_at desc);
create index if not exists movements_user_created_idx on public.cash_movements(user_id,created_at desc);
