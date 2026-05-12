create extension if not exists "pgcrypto";

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  order_no text not null,
  shop_name text not null,
  customer_name text not null,
  order_date date not null,
  amount numeric(12, 2) not null check (amount >= 0),
  status text not null check (status in ('unpaid', 'partial', 'paid', 'cancelled')),
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  received_at date not null,
  amount numeric(12, 2) not null check (amount >= 0),
  method text not null check (method in ('微信', '支付宝', '银行卡', '现金', '其他')),
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  shop_name text not null,
  paid_at date not null,
  amount numeric(12, 2) not null check (amount >= 0),
  category text not null check (category in ('采购付款', '物流付款', '退款', '人工费用', '其他支出')),
  payee text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists orders_user_date_idx on public.orders(user_id, order_date desc);
create index if not exists receipts_user_date_idx on public.receipts(user_id, received_at desc);
create index if not exists payments_user_date_idx on public.payments(user_id, paid_at desc);

alter table public.orders enable row level security;
alter table public.receipts enable row level security;
alter table public.payments enable row level security;

create or replace function public.is_allowed_app_user()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in (
    '542250993@qq.com',
    'futianmart@163.com'
  );
$$;

drop policy if exists "Users can read own orders" on public.orders;
drop policy if exists "Users can insert own orders" on public.orders;
drop policy if exists "Users can delete own orders" on public.orders;
drop policy if exists "Allowed users can read orders" on public.orders;
drop policy if exists "Allowed users can insert orders" on public.orders;
drop policy if exists "Allowed users can delete orders" on public.orders;

drop policy if exists "Users can read own receipts" on public.receipts;
drop policy if exists "Users can insert own receipts" on public.receipts;
drop policy if exists "Users can delete own receipts" on public.receipts;
drop policy if exists "Allowed users can read receipts" on public.receipts;
drop policy if exists "Allowed users can insert receipts" on public.receipts;
drop policy if exists "Allowed users can delete receipts" on public.receipts;

drop policy if exists "Users can read own payments" on public.payments;
drop policy if exists "Users can insert own payments" on public.payments;
drop policy if exists "Users can delete own payments" on public.payments;
drop policy if exists "Allowed users can read payments" on public.payments;
drop policy if exists "Allowed users can insert payments" on public.payments;
drop policy if exists "Allowed users can delete payments" on public.payments;

create policy "Allowed users can read orders"
  on public.orders for select
  using (public.is_allowed_app_user());

create policy "Allowed users can insert orders"
  on public.orders for insert
  with check (public.is_allowed_app_user() and auth.uid() = user_id);

create policy "Allowed users can delete orders"
  on public.orders for delete
  using (public.is_allowed_app_user());

create policy "Allowed users can read receipts"
  on public.receipts for select
  using (public.is_allowed_app_user());

create policy "Allowed users can insert receipts"
  on public.receipts for insert
  with check (public.is_allowed_app_user() and auth.uid() = user_id);

create policy "Allowed users can delete receipts"
  on public.receipts for delete
  using (public.is_allowed_app_user());

create policy "Allowed users can read payments"
  on public.payments for select
  using (public.is_allowed_app_user());

create policy "Allowed users can insert payments"
  on public.payments for insert
  with check (public.is_allowed_app_user() and auth.uid() = user_id);

create policy "Allowed users can delete payments"
  on public.payments for delete
  using (public.is_allowed_app_user());
