\set ON_ERROR_STOP on

-- Run only after 023 in a disposable Supabase-compatible database.
begin;

do $$
begin
  if current_setting('petstock.environment', true) is distinct from 'e2e'
     or current_database() !~ '^petstock_(e2e|test)_[a-z0-9_]+$' then
    raise exception 'PETSTOCK_DISPOSABLE_DATABASE_REQUIRED';
  end if;
end $$;

insert into public.categories(id, name) values
  ('80000000-0000-4000-8000-000000000001', 'Minimum stock category');
insert into public.products(id, name, category_id, type, status, min_stock) values
  ('80000000-0000-4000-8000-000000000002', 'Minimum weight', '80000000-0000-4000-8000-000000000001', 'weight', 'active', 0),
  ('80000000-0000-4000-8000-000000000003', 'Minimum unit', '80000000-0000-4000-8000-000000000001', 'unit', 'active', 0);

insert into public.product_presentations(
  id, product_id, name, weight_kg, cost, price, price_per_kg, stock, min_stock, status
) values
  ('80000000-0000-4000-8000-000000000010', '80000000-0000-4000-8000-000000000002', 'Weight zero exhausted', 10, 10, 20, 2, 0, 0, 'active'),
  ('80000000-0000-4000-8000-000000000011', '80000000-0000-4000-8000-000000000002', 'Weight zero available', 10, 10, 20, 2, 0.001, 0, 'active'),
  ('80000000-0000-4000-8000-000000000012', '80000000-0000-4000-8000-000000000003', 'Unit one', null, 10, 20, null, 1, 1, 'active'),
  ('80000000-0000-4000-8000-000000000013', '80000000-0000-4000-8000-000000000003', 'Unit two available', null, 10, 20, null, 3, 2, 'active'),
  ('80000000-0000-4000-8000-000000000014', '80000000-0000-4000-8000-000000000003', 'Unit three', null, 10, 20, null, 3, 3, 'active'),
  ('80000000-0000-4000-8000-000000000015', '80000000-0000-4000-8000-000000000003', 'Unit four available', null, 10, 20, null, 5, 4, 'active'),
  ('80000000-0000-4000-8000-000000000016', '80000000-0000-4000-8000-000000000003', 'Unit five', null, 10, 20, null, 4, 5, 'active'),
  ('80000000-0000-4000-8000-000000000017', '80000000-0000-4000-8000-000000000003', 'Unit higher', null, 10, 20, null, 9, 9, 'active'),
  ('80000000-0000-4000-8000-000000000018', '80000000-0000-4000-8000-000000000003', 'Unit archived', null, 10, 20, null, 0, 10, 'inactive');

select set_config('request.jwt.claim.sub', '80000000-0000-4000-8000-000000000099', true);
set local role authenticated;

do $$
declare
  v_before_movements bigint;
  v_before_sale_items bigint;
  v_before_purchase_items bigint;
  v_before_stock numeric;
  v_before_cost numeric;
  v_dashboard jsonb;
  v_created jsonb;
  v_error text;
begin
  select count(*) into v_before_movements from public.inventory_movements;
  select count(*) into v_before_sale_items from public.sale_items;
  select count(*) into v_before_purchase_items from public.purchase_items;
  select stock, cost into v_before_stock, v_before_cost
  from public.product_presentations
  where id = '80000000-0000-4000-8000-000000000010';

  update public.product_presentations
  set min_stock = 4.500
  where id = '80000000-0000-4000-8000-000000000010';

  if (select min_stock from public.product_presentations where id = '80000000-0000-4000-8000-000000000010') <> 4.500
     or (select stock from public.product_presentations where id = '80000000-0000-4000-8000-000000000010') <> v_before_stock
     or (select cost from public.product_presentations where id = '80000000-0000-4000-8000-000000000010') <> v_before_cost
     or (select count(*) from public.inventory_movements) <> v_before_movements
     or (select count(*) from public.sale_items) <> v_before_sale_items
     or (select count(*) from public.purchase_items) <> v_before_purchase_items then
    raise exception 'ASSERT_023_EDIT_PRESERVATION';
  end if;

  begin
    update public.product_presentations
    set min_stock = 1.500
    where id = '80000000-0000-4000-8000-000000000012';
  exception when raise_exception then v_error := sqlerrm; end;
  if v_error is distinct from 'INVALID_UNIT_MIN_STOCK' then
    raise exception 'ASSERT_023_UNIT_FRACTION: %', v_error;
  end if;

  v_created := public.create_product_presentation(
    '80000000-0000-4000-8000-000000000002', 'Weight decimal minimum', 5,
    10, 20, 4, 0, 2.375
  );
  if (v_created->>'min_stock')::numeric <> 2.375 then
    raise exception 'ASSERT_023_CREATE_DECIMAL_MINIMUM';
  end if;

  v_error := null;
  begin
    perform public.create_product_presentation(
      '80000000-0000-4000-8000-000000000003', 'Invalid unit minimum', null,
      10, 20, null, 0, 2.500
    );
  exception when raise_exception then v_error := sqlerrm; end;
  if v_error is distinct from 'INVALID_UNIT_MIN_STOCK' then
    raise exception 'ASSERT_023_CREATE_UNIT_FRACTION: %', v_error;
  end if;

  v_dashboard := public.get_dashboard_analytics(current_date, current_date);
  if not exists (select 1 from jsonb_array_elements(v_dashboard->'low_stock') x where x->>'presentation_id' = '80000000-0000-4000-8000-000000000010' and (x->>'min_stock')::numeric = 4.5)
     or not exists (select 1 from jsonb_array_elements(v_dashboard->'low_stock') x where x->>'presentation_id' = '80000000-0000-4000-8000-000000000012')
     or not exists (select 1 from jsonb_array_elements(v_dashboard->'low_stock') x where x->>'presentation_id' = '80000000-0000-4000-8000-000000000014')
     or not exists (select 1 from jsonb_array_elements(v_dashboard->'low_stock') x where x->>'presentation_id' = '80000000-0000-4000-8000-000000000016')
     or not exists (select 1 from jsonb_array_elements(v_dashboard->'low_stock') x where x->>'presentation_id' = '80000000-0000-4000-8000-000000000017')
     or exists (select 1 from jsonb_array_elements(v_dashboard->'low_stock') x where x->>'presentation_id' in (
       '80000000-0000-4000-8000-000000000011',
       '80000000-0000-4000-8000-000000000013',
       '80000000-0000-4000-8000-000000000015',
       '80000000-0000-4000-8000-000000000018'
     )) then
    raise exception 'ASSERT_023_DASHBOARD_THRESHOLDS';
  end if;
end $$;

reset role;
rollback;
