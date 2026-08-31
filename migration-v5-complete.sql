-- PAPEL E CÓDIGO — ERP V5 COMPLETO
-- Execute no SQL Editor do Supabase para ativar persistência em nuvem dos novos módulos.
-- O arquivo é idempotente e pode ser executado novamente.

create extension if not exists pgcrypto;

-- =========================================================
-- HELPERS
-- =========================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- CLIENTES
-- =========================================================
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  legal_name text,
  document_type text check (document_type is null or document_type in ('cpf','cnpj')),
  document_number text,
  phone text,
  whatsapp text,
  email text,
  address text,
  city text,
  state text,
  zip_code text,
  segment text,
  source text,
  seller_name text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- CATÁLOGO FLEXÍVEL
-- Categoria → Produto → Subproduto → atributos → adicionais
-- → receita → regra de preço → fluxo de produção.
-- =========================================================
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  name text not null,
  subproduct text,
  sku text,
  description text,
  unit text not null default 'un',
  sale_price numeric(12,4) not null default 0 check (sale_price >= 0),
  direct_cost numeric(12,4) not null default 0 check (direct_cost >= 0),
  minimum_margin numeric(7,4) not null default 50,
  custom_fields jsonb not null default '[]'::jsonb,
  addons jsonb not null default '[]'::jsonb,
  recipe jsonb not null default '[]'::jsonb,
  pricing_rule jsonb not null default '{}'::jsonb,
  workflow jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- ORÇAMENTOS
-- =========================================================
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  code text,
  version integer not null default 1 check (version > 0),
  status text not null default 'draft'
    check (status in ('draft','sent','waiting','negotiation','approved','lost','expired')),
  seller_name text,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  estimated_cost numeric(12,2) not null default 0,
  estimated_margin numeric(7,4) not null default 0,
  valid_until date,
  promised_date date,
  note text,
  sent_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  description text not null,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit_price numeric(12,4) not null default 0,
  unit_cost numeric(12,4) not null default 0,
  total numeric(12,2) not null default 0,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.quote_items add column if not exists product_id uuid references public.products(id) on delete set null;

-- =========================================================
-- PEDIDOS
-- =========================================================
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  code text,
  status text not null default 'approved'
    check (status in (
      'approved','art','waiting_approval','print_queue','printing','finishing',
      'cutting','assembly','quality','ready','delivered','cancelled'
    )),
  seller_name text,
  total numeric(12,2) not null default 0,
  estimated_cost numeric(12,2) not null default 0,
  promised_date date,
  priority integer not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  quote_item_id uuid references public.quote_items(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  description text not null,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit_price numeric(12,4) not null default 0,
  unit_cost numeric(12,4) not null default 0,
  total numeric(12,2) not null default 0,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.order_items add column if not exists product_id uuid references public.products(id) on delete set null;

-- =========================================================
-- PRODUÇÃO / PCP
-- =========================================================
create table if not exists public.production_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete cascade,
  stage text not null,
  title text not null,
  position integer not null default 0,
  status text not null default 'todo' check (status in ('todo','doing','done','blocked','cancelled')),
  assignee text,
  due_at timestamptz,
  estimated_minutes integer,
  actual_minutes integer,
  started_at timestamptz,
  completed_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- TAREFAS
-- =========================================================
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo','doing','done','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  assignee text,
  due_at timestamptz,
  estimated_minutes integer,
  actual_minutes integer,
  completed_at timestamptz,
  automation_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks add column if not exists automation_key text;

-- =========================================================
-- APROVAÇÃO DE ARTE
-- =========================================================
create table if not exists public.art_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  version integer not null default 1,
  file_url text,
  status text not null default 'pending' check (status in ('pending','approved','changes_requested')),
  customer_name text,
  customer_note text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- FORNECEDORES / ESTOQUE / COMPRAS
-- =========================================================
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  document_number text,
  phone text,
  whatsapp text,
  email text,
  lead_time_days integer not null default 0,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.suppliers add column if not exists lead_time_days integer not null default 0;

create table if not exists public.stock_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  name text not null,
  category text,
  unit text not null default 'un',
  current_qty numeric(14,3) not null default 0,
  reserved_qty numeric(14,3) not null default 0,
  minimum_qty numeric(14,3) not null default 0,
  average_cost numeric(12,4) not null default 0,
  location text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stock_item_id uuid not null references public.stock_items(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  movement_type text not null check (movement_type in ('in','out','reserve','release','adjustment')),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(12,4),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  stock_item_id uuid references public.stock_items(id) on delete set null,
  quantity numeric(14,3) not null default 0,
  estimated_cost numeric(12,2) not null default 0,
  status text not null default 'requested' check (status in ('requested','quoted','approved','ordered','received','cancelled')),
  needed_by date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- FINANCEIRO
-- =========================================================
create table if not exists public.receivables (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  description text,
  due_date date,
  amount numeric(12,2) not null default 0,
  received_amount numeric(12,2) not null default 0,
  status text not null default 'pending' check (status in ('pending','partial','paid','overdue','cancelled')),
  payment_method text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payables (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  description text not null,
  category text,
  cost_center text,
  due_date date,
  amount numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  status text not null default 'pending' check (status in ('pending','partial','paid','overdue','cancelled')),
  recurring boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- AUTOMAÇÕES E AUDITORIA
-- =========================================================
create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  trigger_event text not null,
  condition_json jsonb not null default '{}'::jsonb,
  action_type text not null,
  action_json jsonb not null default '{}'::jsonb,
  delay_minutes integer not null default 0,
  active boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

-- =========================================================
-- RLS
-- =========================================================
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers','products','quotes','quote_items','orders','order_items','production_steps',
    'tasks','art_approvals','suppliers','stock_items','stock_movements','purchase_requests',
    'receivables','payables','automation_rules','audit_logs'
  ]
  LOOP
    EXECUTE format('alter table public.%I enable row level security', t);
    EXECUTE format('drop policy if exists "%s own" on public.%I', t, t);
    EXECUTE format(
      'create policy "%s own" on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t, t
    );
  END LOOP;
END $$;

-- =========================================================
-- UPDATED_AT TRIGGERS
-- =========================================================
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers','products','quotes','orders','production_steps','tasks','art_approvals','suppliers',
    'stock_items','purchase_requests','receivables','payables','automation_rules'
  ]
  LOOP
    EXECUTE format('drop trigger if exists set_%s_updated_at on public.%I', t, t);
    EXECUTE format('create trigger set_%s_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  END LOOP;
END $$;

-- =========================================================
-- ÍNDICES
-- =========================================================
create index if not exists customers_user_name_idx on public.customers(user_id,name);
create index if not exists products_user_category_idx on public.products(user_id,active,category,name);
create index if not exists quotes_user_status_idx on public.quotes(user_id,status,updated_at desc);
create index if not exists quote_items_quote_idx on public.quote_items(quote_id);
create index if not exists orders_user_status_idx on public.orders(user_id,status,updated_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists production_steps_order_idx on public.production_steps(order_id,status,position);
create index if not exists tasks_user_due_idx on public.tasks(user_id,status,due_at);
create index if not exists art_approvals_order_idx on public.art_approvals(order_id,version desc);
create index if not exists suppliers_user_name_idx on public.suppliers(user_id,name);
create index if not exists stock_items_user_active_idx on public.stock_items(user_id,active,name);
create index if not exists stock_movements_item_idx on public.stock_movements(stock_item_id,created_at desc);
create index if not exists purchase_requests_user_status_idx on public.purchase_requests(user_id,status,needed_by);
create index if not exists receivables_user_status_idx on public.receivables(user_id,status,due_date);
create index if not exists payables_user_status_idx on public.payables(user_id,status,due_date);
create index if not exists automation_rules_user_active_idx on public.automation_rules(user_id,active,trigger_event);
create index if not exists audit_logs_user_entity_idx on public.audit_logs(user_id,entity_type,entity_id,created_at desc);

-- =========================================================
-- FUNÇÃO ATÔMICA PARA APROVAR ORÇAMENTO
-- Cria pedido, itens, conta a receber e tarefa inicial.
-- =========================================================
create or replace function public.approve_quote_to_order(p_quote_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  q public.quotes%rowtype;
  new_order_id uuid;
  order_code text;
begin
  select * into q from public.quotes
  where id = p_quote_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Orçamento não encontrado';
  end if;

  if q.status = 'approved' and exists(select 1 from public.orders where quote_id = q.id) then
    select id into new_order_id from public.orders where quote_id = q.id order by created_at desc limit 1;
    return new_order_id;
  end if;

  order_code := 'PED-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));

  insert into public.orders(user_id,quote_id,customer_id,code,status,seller_name,total,estimated_cost,promised_date,note)
  values(q.user_id,q.id,q.customer_id,order_code,'approved',q.seller_name,q.total,q.estimated_cost,q.promised_date,q.note)
  returning id into new_order_id;

  insert into public.order_items(user_id,order_id,quote_item_id,product_id,service_id,description,quantity,unit_price,unit_cost,total,attributes)
  select user_id,new_order_id,id,product_id,service_id,description,quantity,unit_price,unit_cost,total,attributes
  from public.quote_items where quote_id = q.id;

  insert into public.receivables(user_id,customer_id,order_id,description,due_date,amount,status)
  values(q.user_id,q.customer_id,new_order_id,'Pedido '||order_code,coalesce(q.promised_date,current_date),q.total,'pending');

  insert into public.tasks(user_id,order_id,customer_id,title,status,priority,due_at,automation_key)
  values(q.user_id,new_order_id,q.customer_id,'Preparar pedido '||order_code,'todo','high',coalesce(q.promised_date,current_date)::timestamptz,'quote_approved');

  update public.quotes set status='approved',approved_at=now() where id=q.id;
  return new_order_id;
end;
$$;
