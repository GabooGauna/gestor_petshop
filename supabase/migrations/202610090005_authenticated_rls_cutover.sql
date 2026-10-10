-- Apply only after application login is deployed. This migration aborts safely
-- when the project has no Auth users.
do $$ begin
  if not exists (select 1 from auth.users) then
    raise exception using errcode='P0001', message='PETSTOCK_AUTH_USERS_REQUIRED',
      hint='Deploy and verify Supabase Auth before the RLS cutover.';
  end if;
end $$;

alter table public.categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.product_presentations enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.inventory_movements enable row level security;

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select on public.sales,public.sale_items,public.purchases,public.purchase_items,public.inventory_movements to authenticated;
grant select,insert,update,delete on public.categories to authenticated;
grant select,insert,update on public.suppliers to authenticated;
grant select,insert,update on public.products to authenticated;
grant select on public.product_presentations to authenticated;
grant insert(product_id,name,weight_kg,cost,price,price_per_kg) on public.product_presentations to authenticated;
grant update(product_id,name,weight_kg,cost,price,price_per_kg) on public.product_presentations to authenticated;

create policy categories_authenticated_all on public.categories for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy suppliers_authenticated_select on public.suppliers for select to authenticated using (auth.uid() is not null);
create policy suppliers_authenticated_insert on public.suppliers for insert to authenticated with check (auth.uid() is not null);
create policy suppliers_authenticated_update on public.suppliers for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy products_authenticated_select on public.products for select to authenticated using (auth.uid() is not null);
create policy products_authenticated_insert on public.products for insert to authenticated with check (auth.uid() is not null);
create policy products_authenticated_update on public.products for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy presentations_authenticated_select on public.product_presentations for select to authenticated using (auth.uid() is not null);
create policy presentations_authenticated_insert on public.product_presentations for insert to authenticated with check (auth.uid() is not null);
create policy presentations_authenticated_update on public.product_presentations for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
create policy sales_authenticated_read on public.sales for select to authenticated using (auth.uid() is not null);
create policy sale_items_authenticated_read on public.sale_items for select to authenticated using (auth.uid() is not null);
create policy purchases_authenticated_read on public.purchases for select to authenticated using (auth.uid() is not null);
create policy purchase_items_authenticated_read on public.purchase_items for select to authenticated using (auth.uid() is not null);
create policy movements_authenticated_read on public.inventory_movements for select to authenticated using (auth.uid() is not null);

revoke all on function public.process_sale(text,jsonb) from public,anon;
revoke all on function public.process_purchase(uuid,text,jsonb) from public,anon;
revoke all on function public.record_shrinkage(uuid,numeric,text) from public,anon;
revoke all on function public.record_stock_adjustment(uuid,numeric,text) from public,anon;
grant execute on function public.process_sale(text,jsonb) to authenticated;
grant execute on function public.process_purchase(uuid,text,jsonb) to authenticated;
grant execute on function public.record_shrinkage(uuid,numeric,text) to authenticated;
grant execute on function public.record_stock_adjustment(uuid,numeric,text) to authenticated;
