-- MIGRAÇÃO V2 — Caixa contínuo Papel e Código
-- Execute UMA VEZ no SQL Editor do Supabase.
-- Esta migração preserva as vendas existentes.

-- O sistema não usa mais abertura/fechamento de caixa.
alter table public.sales
  alter column cash_session_id drop not null;

alter table public.cash_movements
  alter column cash_session_id drop not null;

-- Novos dados da venda.
alter table public.sales
  add column if not exists seller_name text;

alter table public.sales
  add column if not exists customer_phone text;

-- Limita os responsáveis aceitos pelo sistema, mantendo vendas antigas com NULL válidas.
alter table public.sales
  drop constraint if exists sales_seller_name_check;

alter table public.sales
  add constraint sales_seller_name_check
  check (seller_name is null or seller_name in ('IGOR','JHONATAN','BEATRIZ'));

-- Índices úteis para consultas diárias.
create index if not exists sales_seller_created_idx
  on public.sales(seller_name, created_at desc);

create index if not exists movements_user_created_idx
  on public.cash_movements(user_id, created_at desc);
