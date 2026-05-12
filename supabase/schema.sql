create extension if not exists "pgcrypto";

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  order_no text not null,
  shop_name text not null,
  customer_name text not null,
  order_date date not null,
  amount numeric(12, 2) not null check (amount >= 0),
  deposit_amount numeric(12, 2) not null default 0 check (deposit_amount >= 0),
  status text not null check (status in ('unpaid', 'partial', 'paid', 'cancelled')),
  photo_path text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

alter table public.orders add column if not exists deposit_amount numeric(12, 2) not null default 0 check (deposit_amount >= 0);
alter table public.orders add column if not exists photo_path text not null default '';

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

grant usage on schema public to anon, authenticated;
grant execute on function public.is_allowed_app_user() to authenticated;
grant select, insert, update, delete on public.orders to authenticated;
grant select, insert, update, delete on public.receipts to authenticated;
grant select, insert, update, delete on public.payments to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-photos', 'order-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

drop policy if exists "Users can read own orders" on public.orders;
drop policy if exists "Users can insert own orders" on public.orders;
drop policy if exists "Users can delete own orders" on public.orders;
drop policy if exists "Allowed users can read orders" on public.orders;
drop policy if exists "Allowed users can insert orders" on public.orders;
drop policy if exists "Allowed users can update orders" on public.orders;
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
drop policy if exists "Allowed users can update payments" on public.payments;
drop policy if exists "Allowed users can delete payments" on public.payments;

drop policy if exists "Allowed users can read order photos" on storage.objects;
drop policy if exists "Allowed users can upload order photos" on storage.objects;
drop policy if exists "Allowed users can update order photos" on storage.objects;
drop policy if exists "Allowed users can delete order photos" on storage.objects;

create policy "Allowed users can read orders"
  on public.orders for select
  using (public.is_allowed_app_user());

create policy "Allowed users can insert orders"
  on public.orders for insert
  with check (public.is_allowed_app_user() and auth.uid() = user_id);

create policy "Allowed users can update orders"
  on public.orders for update
  using (public.is_allowed_app_user())
  with check (public.is_allowed_app_user());

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

create policy "Allowed users can update payments"
  on public.payments for update
  using (public.is_allowed_app_user())
  with check (public.is_allowed_app_user());

create policy "Allowed users can delete payments"
  on public.payments for delete
  using (public.is_allowed_app_user());

create policy "Allowed users can read order photos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'order-photos' and public.is_allowed_app_user());

create policy "Allowed users can upload order photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'order-photos' and public.is_allowed_app_user());

create policy "Allowed users can update order photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'order-photos' and public.is_allowed_app_user())
  with check (bucket_id = 'order-photos' and public.is_allowed_app_user());

create policy "Allowed users can delete order photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'order-photos' and public.is_allowed_app_user());
