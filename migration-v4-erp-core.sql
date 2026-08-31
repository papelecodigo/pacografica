-- PAPEL E CÓDIGO — MIGRAÇÃO V4 / ERP CORE
-- NÃO É NECESSÁRIO EXECUTAR AINDA.
-- Execute somente quando o front V4 estiver pronto para usar estes módulos.
-- Idempotente: pode ser executada novamente.

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
  service_id uuid references public.services(id) on delete set null,
  description text not null,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit_price numeric(12,4) not null default 0,
  unit_cost numeric(12,4) not null default 0,
  total numeric(12,2) not null default 0,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

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
  service_id uuid references public.services(id) on delete set null,
  description text not null,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit_price numeric(12,4) not null default 0,
  unit_cost numeric(12,4) not null default 0,
  total numeric(12,2) not null default 0,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- FORNECEDORES
-- =========================================================
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  document_number text,
  phone text,
  whatsapp text,
  email text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- ESTOQUE
-- =========================================================
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
  movement_type text not null
    check (movement_type in ('in','out','reserve','release','adjustment')),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(12,4),
  note text,
  created_at timestamptz not null default now()
);

-- =========================================================
-- CONTAS A RECEBER
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

-- =========================================================
-- CONTAS A PAGAR
-- =========================================================
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
-- RLS
-- =========================================================
alter table public.customers enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.tasks enable row level security;
alter table public.suppliers enable row level security;
alter table public.stock_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.receivables enable row level security;
alter table public.payables enable row level security;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers','quotes','quote_items','orders','order_items','tasks','suppliers',
    'stock_items','stock_movements','receivables','payables'
  ]
  LOOP
    EXECUTE format('drop policy if exists "%s own" on public.%I', t, t);
    EXECUTE format(
      'create policy "%s own" on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t, t
    );
  END LOOP;
END $$;

-- =========================================================
-- ÍNDICES
-- =========================================================
create index if not exists customers_user_name_idx on public.customers(user_id,name);
create index if not exists quotes_user_status_idx on public.quotes(user_id,status,updated_at desc);
create index if not exists quote_items_quote_idx on public.quote_items(quote_id);
create index if not exists orders_user_status_idx on public.orders(user_id,status,updated_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists tasks_user_due_idx on public.tasks(user_id,status,due_at);
create index if not exists suppliers_user_name_idx on public.suppliers(user_id,name);
create index if not exists stock_items_user_active_idx on public.stock_items(user_id,active,name);
create index if not exists stock_movements_item_idx on public.stock_movements(stock_item_id,created_at desc);
create index if not exists receivables_user_status_idx on public.receivables(user_id,status,due_date);
create index if not exists payables_user_status_idx on public.payables(user_id,status,due_date);
