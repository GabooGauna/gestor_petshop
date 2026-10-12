\set ON_ERROR_STOP on

-- Run only after 022 in a disposable Supabase-compatible database.
begin;

do $$
begin
  if current_setting('petstock.environment', true) is distinct from 'e2e'
     or current_database() !~ '^petstock_(e2e|test)_[a-z0-9_]+$' then
    raise exception 'PETSTOCK_DISPOSABLE_DATABASE_REQUIRED';
  end if;
end $$;

insert into public.categories(id, name) values
  ('60000000-0000-4000-8000-000000000001', 'Lifecycle category');
insert into public.suppliers(id, name) values
  ('60000000-0000-4000-8000-000000000002', 'Lifecycle supplier');
insert into public.products(id, name, category_id, type, status, min_stock) values
  ('60000000-0000-4000-8000-000000000003', 'Lifecycle weight', '60000000-0000-4000-8000-000000000001', 'weight', 'active', 5),
  ('60000000-0000-4000-8000-000000000004', 'Lifecycle unit', '60000000-0000-4000-8000-000000000001', 'unit', 'active', 5);
insert into public.product_presentations(
  id, product_id, name, weight_kg, cost, price, price_per_kg, stock
) values
  ('60000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000003', 'Bag 20 kg archived', 20, 20, 100, 10, 100),
  ('60000000-0000-4000-8000-000000000006', '60000000-0000-4000-8000-000000000004', 'Unit archived', null, 2, 4, null, 4);
insert into public.inventory_movements(
  product_id, presentation_id, type, quantity, reason, reference_type, reference_id
) values
  ('60000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000005', 'ajuste', 100, 'Lifecycle opening', 'opening_balance', '60000000-0000-4000-8000-000000000005'),
  ('60000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000006', 'ajuste', 4, 'Lifecycle opening', 'opening_balance', '60000000-0000-4000-8000-000000000006');

select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000099', true);
set local role authenticated;

-- Baseline regression: all four modes still execute with exact 020 snapshots.
do $$
declare
  v_amount jsonb;
  v_weight jsonb;
  v_package jsonb;
  v_unit jsonb;
begin
  v_amount := public.process_sale('efectivo',
    '[{"presentation_id":"60000000-0000-4000-8000-000000000005","mode":"amount","amount":"10.00"}]');
  v_weight := public.process_sale('efectivo',
    '[{"presentation_id":"60000000-0000-4000-8000-000000000005","mode":"weight","quantity":"1"}]');
  v_package := public.process_sale('efectivo',
    '[{"presentation_id":"60000000-0000-4000-8000-000000000005","mode":"package","quantity":"1"}]');
  v_unit := public.process_sale('efectivo',
    '[{"presentation_id":"60000000-0000-4000-8000-000000000006","mode":"unit","quantity":"1"}]');

  if (v_amount #>> '{items,0,stock_quantity}')::numeric <> 1
     or (v_weight #>> '{items,0,stock_quantity}')::numeric <> 1
     or (v_package #>> '{items,0,stock_quantity}')::numeric <> 20
     or (v_unit #>> '{items,0,stock_quantity}')::numeric <> 1
     or (v_amount #>> '{items,0,replacement_cost_snapshot}')::numeric <> 20
  then
    raise exception 'ASSERT_022_FOUR_SALE_MODES_REGRESSION';
  end if;
end $$;

do $$
declare
  v_before_weight numeric;
  v_before_unit numeric;
  v_before_cost numeric;
  v_sales bigint;
  v_purchases bigint;
  v_items bigint;
  v_purchase_items bigint;
  v_movements bigint;
  v_result jsonb;
  v_error text;
begin
  select stock, cost into v_before_weight, v_before_cost
  from public.product_presentations where id = '60000000-0000-4000-8000-000000000005';
  select stock into v_before_unit
  from public.product_presentations where id = '60000000-0000-4000-8000-000000000006';

  v_result := public.archive_presentation('60000000-0000-4000-8000-000000000005');
  if v_result->>'status' <> 'inactive' or v_result->>'archived' <> 'true' then
    raise exception 'ASSERT_022_ARCHIVE_RESPONSE';
  end if;
  perform public.archive_presentation('60000000-0000-4000-8000-000000000006');

  -- Direct authenticated catalog writes must neither reactivate nor mutate an
  -- archived row, and sensitive inventory/cost columns are never client-writable.
  begin
    update public.product_presentations
    set name = 'Forbidden archived edit'
    where id = '60000000-0000-4000-8000-000000000005';
    if found then raise exception 'ASSERT_022_DIRECT_ARCHIVED_EDIT_ACCEPTED'; end if;
  exception when insufficient_privilege then
    null;
  end;

  if has_column_privilege('authenticated', 'public.product_presentations', 'status', 'UPDATE')
     or has_column_privilege('authenticated', 'public.product_presentations', 'product_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.product_presentations', 'cost', 'UPDATE')
     or has_column_privilege('authenticated', 'public.product_presentations', 'stock', 'UPDATE')
  then
    raise exception 'ASSERT_022_SENSITIVE_COLUMN_GRANT';
  end if;

  select count(*) into v_sales from public.sales;
  select count(*) into v_purchases from public.purchases;
  select count(*) into v_items from public.sale_items;
  select count(*) into v_purchase_items from public.purchase_items;
  select count(*) into v_movements from public.inventory_movements;

  begin
    perform public.process_sale('efectivo',
      '[{"presentation_id":"60000000-0000-4000-8000-000000000005","mode":"amount","amount":"10.00"}]');
  exception when raise_exception then v_error := sqlerrm; end;
  if v_error is distinct from 'INACTIVE_PRESENTATION' then
    raise exception 'ASSERT_022_INACTIVE_AMOUNT: %', v_error;
  end if;

  v_error := null;
  begin
    perform public.process_sale('efectivo',
      '[{"presentation_id":"60000000-0000-4000-8000-000000000005","mode":"weight","quantity":"1"}]');
  exception when raise_exception then v_error := sqlerrm; end;
  if v_error is distinct from 'INACTIVE_PRESENTATION' then
    raise exception 'ASSERT_022_INACTIVE_WEIGHT: %', v_error;
  end if;

  v_error := null;
  begin
    perform public.process_sale('efectivo',
      '[{"presentation_id":"60000000-0000-4000-8000-000000000005","mode":"package","quantity":"1"}]');
  exception when raise_exception then v_error := sqlerrm; end;
  if v_error is distinct from 'INACTIVE_PRESENTATION' then
    raise exception 'ASSERT_022_INACTIVE_PACKAGE: %', v_error;
  end if;

  v_error := null;
  begin
    perform public.process_sale('efectivo',
      '[{"presentation_id":"60000000-0000-4000-8000-000000000006","mode":"unit","quantity":"1"}]');
  exception when raise_exception then v_error := sqlerrm; end;
  if v_error is distinct from 'INACTIVE_PRESENTATION' then
    raise exception 'ASSERT_022_INACTIVE_UNIT: %', v_error;
  end if;

  v_error := null;
  begin
    perform public.process_purchase(
      '60000000-0000-4000-8000-000000000002', 'ARCHIVED',
      '[{"presentation_id":"60000000-0000-4000-8000-000000000005","quantity":"1","unit_cost":"30.00"}]'
    );
  exception when raise_exception then v_error := sqlerrm; end;
  if v_error is distinct from 'INACTIVE_PRESENTATION' then
    raise exception 'ASSERT_022_INACTIVE_PURCHASE: %', v_error;
  end if;

  v_error := null;
  begin
    perform public.record_stock_adjustment(
      '60000000-0000-4000-8000-000000000005', 50, 'Archived adjustment'
    );
  exception when raise_exception then v_error := sqlerrm; end;
  if v_error is distinct from 'INACTIVE_PRESENTATION' then
    raise exception 'ASSERT_022_INACTIVE_ADJUSTMENT: %', v_error;
  end if;

  v_error := null;
  begin
    perform public.record_shrinkage(
      '60000000-0000-4000-8000-000000000005', 1, 'Archived shrinkage'
    );
  exception when raise_exception then v_error := sqlerrm; end;
  if v_error is distinct from 'INACTIVE_PRESENTATION' then
    raise exception 'ASSERT_022_INACTIVE_SHRINKAGE: %', v_error;
  end if;

  if (select stock from public.product_presentations where id = '60000000-0000-4000-8000-000000000005') <> v_before_weight
     or (select stock from public.product_presentations where id = '60000000-0000-4000-8000-000000000006') <> v_before_unit
     or (select cost from public.product_presentations where id = '60000000-0000-4000-8000-000000000005') <> v_before_cost
     or (select count(*) from public.sales) <> v_sales
     or (select count(*) from public.purchases) <> v_purchases
     or (select count(*) from public.sale_items) <> v_items
     or (select count(*) from public.purchase_items) <> v_purchase_items
     or (select count(*) from public.inventory_movements) <> v_movements
  then
    raise exception 'ASSERT_022_ARCHIVED_ATOMICITY';
  end if;
end $$;

-- Archived identities remain in historical profitability and movements, while
-- operational low-stock excludes them.
do $$
declare
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_detail jsonb;
  v_movements jsonb;
  v_dashboard jsonb;
begin
  v_detail := public.get_profitability_detail_report(v_today, v_today);
  v_movements := public.get_inventory_movement_report(v_today, v_today, null, null, 500, 0);
  v_dashboard := public.get_dashboard_analytics(v_today, v_today);

  if not exists (
      select 1 from jsonb_array_elements(v_detail) x
      where x->>'presentation_name' in ('Bag 20 kg archived', 'Unit archived')
    )
    or not exists (
      select 1 from jsonb_array_elements(v_movements->'items') x
      where x->>'presentation_name' in ('Bag 20 kg archived', 'Unit archived')
    )
    or exists (
      select 1 from jsonb_array_elements(v_dashboard->'low_stock') x
      where x->>'presentation_id' in (
        '60000000-0000-4000-8000-000000000005',
        '60000000-0000-4000-8000-000000000006'
      )
    )
  then
    raise exception 'ASSERT_022_HISTORY_OR_OPERATIONAL_FILTER';
  end if;
end $$;

do $$
declare
  v_weight_stock numeric;
  v_weight_cost numeric;
  v_result jsonb;
begin
  select stock, cost into v_weight_stock, v_weight_cost
  from public.product_presentations where id = '60000000-0000-4000-8000-000000000005';
  v_result := public.reactivate_presentation('60000000-0000-4000-8000-000000000005');
  if v_result->>'status' <> 'active'
     or (select stock from public.product_presentations where id = '60000000-0000-4000-8000-000000000005') <> v_weight_stock
     or (select cost from public.product_presentations where id = '60000000-0000-4000-8000-000000000005') <> v_weight_cost
  then
    raise exception 'ASSERT_022_REACTIVATION_PRESERVATION';
  end if;

  v_result := public.delete_presentation('60000000-0000-4000-8000-000000000005');
  if v_result->>'deleted' <> 'false' or v_result->>'archived' <> 'true'
     or not exists (
       select 1 from public.product_presentations
       where id = '60000000-0000-4000-8000-000000000005' and status = 'inactive'
     )
  then
    raise exception 'ASSERT_022_DELETE_COMPATIBILITY';
  end if;

  begin
    perform public.archive_presentation('60000000-0000-4000-8000-000000000005');
    raise exception 'ASSERT_022_REPEATED_ARCHIVE_ACCEPTED';
  exception when raise_exception then
    if sqlerrm <> 'PRESENTATION_ALREADY_INACTIVE' then raise; end if;
  end;

  perform public.reactivate_presentation('60000000-0000-4000-8000-000000000005');
  begin
    perform public.reactivate_presentation('60000000-0000-4000-8000-000000000005');
    raise exception 'ASSERT_022_REPEATED_REACTIVATION_ACCEPTED';
  exception when raise_exception then
    if sqlerrm <> 'PRESENTATION_ALREADY_ACTIVE' then raise; end if;
  end;

  perform public.delete_product('60000000-0000-4000-8000-000000000004');
  begin
    perform public.reactivate_presentation('60000000-0000-4000-8000-000000000006');
    raise exception 'ASSERT_022_REACTIVATION_UNDER_INACTIVE_PRODUCT_ACCEPTED';
  exception when raise_exception then
    if sqlerrm <> 'INACTIVE_PRODUCT' then raise; end if;
  end;
end $$;

reset role;
rollback;

