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
grant select, insert, delete on public.orders to authenticated;
grant select, insert, delete on public.receipts to authenticated;
grant select, insert, delete on public.payments to authenticated;

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
