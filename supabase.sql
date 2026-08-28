-- Execute este arquivo no SQL Editor do Supabase.
-- Depois crie seu usuário em Authentication > Users.

create extension if not exists pgcrypto;

create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opening_amount numeric(12,2) not null default 0 check (opening_amount >= 0),
  status text not null default 'open' check (status in ('open','closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  counted_cash numeric(12,2),
  expected_cash numeric(12,2),
  difference numeric(12,2),
  closing_note text
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cash_session_id uuid not null references public.cash_sessions(id) on delete restrict,
  customer_name text,
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
  cash_session_id uuid not null references public.cash_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('entrada','saida')),
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create unique index if not exists one_open_cash_per_user
on public.cash_sessions(user_id)
where status = 'open';

alter table public.cash_sessions enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.cash_movements enable row level security;

-- Políticas: cada usuário só vê e altera os próprios dados.
drop policy if exists "cash own" on public.cash_sessions;
create policy "cash own" on public.cash_sessions for all to authenticated
using (auth.uid() = user_id) with check (auth.uid() = user_id);

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
create index if not exists movement_cash_created_idx on public.cash_movements(cash_session_id,created_at desc);
