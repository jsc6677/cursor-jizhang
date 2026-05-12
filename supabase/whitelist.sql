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
alter table public.orders add column if not exists deposit_amount numeric(12, 2) not null default 0 check (deposit_amount >= 0);
alter table public.orders add column if not exists receivable_amount numeric(12, 2) not null default 0 check (receivable_amount >= 0);
alter table public.orders add column if not exists photo_path text not null default '';
alter table public.orders add column if not exists spreadsheet_path text not null default '';
alter table public.orders drop constraint if exists orders_status_check;
update public.orders
set status = case
    when status in ('paid', 'completed') then 'completed'
    else 'ongoing'
  end,
  receivable_amount = case
    when receivable_amount = 0 then greatest(amount - deposit_amount, 0)
    else receivable_amount
  end;
alter table public.orders add constraint orders_status_check check (status in ('ongoing', 'completed'));
grant select, insert, update, delete on public.orders to authenticated;
grant select, insert, update, delete on public.receipts to authenticated;
grant select, insert, update, delete on public.payments to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-photos', 'order-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'order-spreadsheets',
  'order-spreadsheets',
  false,
  20971520,
  array[
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = 20971520,
    allowed_mime_types = array[
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream'
    ];

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
drop policy if exists "Allowed users can read order spreadsheets" on storage.objects;
drop policy if exists "Allowed users can upload order spreadsheets" on storage.objects;
drop policy if exists "Allowed users can update order spreadsheets" on storage.objects;
drop policy if exists "Allowed users can delete order spreadsheets" on storage.objects;

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

create policy "Allowed users can read order spreadsheets"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'order-spreadsheets' and public.is_allowed_app_user());

create policy "Allowed users can upload order spreadsheets"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'order-spreadsheets' and public.is_allowed_app_user());

create policy "Allowed users can update order spreadsheets"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'order-spreadsheets' and public.is_allowed_app_user())
  with check (bucket_id = 'order-spreadsheets' and public.is_allowed_app_user());

create policy "Allowed users can delete order spreadsheets"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'order-spreadsheets' and public.is_allowed_app_user());
