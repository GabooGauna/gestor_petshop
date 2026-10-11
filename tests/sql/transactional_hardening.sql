\set ON_ERROR_STOP on

-- Run only against an isolated database after all project migrations.
-- Every fixture and mutation is enclosed in one transaction and rolled back.
begin;

do $$
begin
  if current_setting('petstock.environment', true) is distinct from 'e2e' then
    raise exception 'PETSTOCK_E2E_DATABASE_REQUIRED'
      using hint = 'Run with PGOPTIONS="-c petstock.environment=e2e" against an isolated database.';
  end if;
  if not exists (select 1 from auth.users) then
    raise exception 'PETSTOCK_AUTH_USERS_REQUIRED';
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in (
      'categories','suppliers','products','product_presentations','sales','sale_items',
      'purchases','purchase_items','inventory_movements'
    ) and not c.relrowsecurity
  ) then
    raise exception 'PETSTOCK_RLS_NOT_ENABLED_ON_ALL_TABLES';
  end if;
end $$;

insert into public.categories(id,name) values
  ('10000000-0000-4000-8000-000000000001','E2E Category');
insert into public.suppliers(id,name) values
  ('10000000-0000-4000-8000-000000000002','E2E Supplier'),
  ('10000000-0000-4000-8000-000000000012','E2E Unused Supplier'),
  ('10000000-0000-4000-8000-000000000013','E2E Active Supplier');
insert into public.products(id,name,category_id,type,status,min_stock) values
  ('10000000-0000-4000-8000-000000000003','E2E Weight','10000000-0000-4000-8000-000000000001','weight','active',5),
  ('10000000-0000-4000-8000-000000000004','E2E Unit','10000000-0000-4000-8000-000000000001','unit','active',1);
insert into public.product_presentations(id,product_id,name,weight_kg,cost,price,price_per_kg,stock) values
  ('10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000003','Bag 20kg',20,25000,35000,1750,40),
  ('10000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000004','Unit',null,5000,8000,null,3);
insert into public.inventory_movements(product_id,presentation_id,type,quantity,reason,reference_type,reference_id) values
  ('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000005','ajuste',40,'E2E opening','opening_balance','10000000-0000-4000-8000-000000000005'),
  ('10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000006','ajuste',3,'E2E opening','opening_balance','10000000-0000-4000-8000-000000000006');

-- RLS/privilege matrix: anon has no table reads and authenticated cannot write stock directly.
set local role anon;
do $$ begin
  begin
    perform id from public.products limit 1;
    raise exception 'ASSERT_ANON_PRODUCTS_READ_WAS_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000099',true);
set local role authenticated;
do $$
begin
  if not exists (select 1 from public.products where id='10000000-0000-4000-8000-000000000003') then
    raise exception 'ASSERT_AUTHENTICATED_READ_FAILED';
  end if;
  begin
    update public.product_presentations set stock=999 where id='10000000-0000-4000-8000-000000000005';
    raise exception 'ASSERT_DIRECT_STOCK_UPDATE_WAS_ALLOWED';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.product_presentations set cost=1 where id='10000000-0000-4000-8000-000000000005';
    raise exception 'ASSERT_DIRECT_REPLACEMENT_COST_UPDATE_WAS_ALLOWED';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.sales(total_amount,total_cost,payment_method) values(1,0,'efectivo');
    raise exception 'ASSERT_DIRECT_SALE_INSERT_WAS_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Purchase v2: server derives $250,000 and +200.000 kg atomically.
do $$
declare v jsonb; v_stock numeric; v_movement numeric;
begin
  v := public.process_purchase(
    '10000000-0000-4000-8000-000000000002','E2E-001',
    '[{"presentation_id":"10000000-0000-4000-8000-000000000005","quantity":"10","unit_cost":"25000.00"}]'::jsonb
  );
  if v->>'total_amount' <> '250000.00' then raise exception 'ASSERT_PURCHASE_TOTAL: %',v; end if;
  if v#>>'{items,0,stock_added}' <> '200.000' then raise exception 'ASSERT_PURCHASE_STOCK_ADDED: %',v; end if;
  select stock into v_stock from public.product_presentations where id='10000000-0000-4000-8000-000000000005';
  select quantity into v_movement from public.inventory_movements where reference_id=(v->>'purchase_id')::uuid;
  if v_stock <> 240.000 or v_movement <> 200.000 then raise exception 'ASSERT_PURCHASE_ATOMIC_STATE'; end if;
end $$;

-- Validation and rollback: a failing second line leaves no sale, item, movement or stock change.
do $$
declare before_sales bigint; before_items bigint; before_moves bigint; before_weight numeric; before_unit numeric;
begin
  select count(*) into before_sales from public.sales;
  select count(*) into before_items from public.sale_items;
  select count(*) into before_moves from public.inventory_movements;
  select stock into before_weight from public.product_presentations where id='10000000-0000-4000-8000-000000000005';
  select stock into before_unit from public.product_presentations where id='10000000-0000-4000-8000-000000000006';
  begin
    perform public.process_sale('efectivo','[
      {"presentation_id":"10000000-0000-4000-8000-000000000005","mode":"weight","quantity":"2.500"},
      {"presentation_id":"10000000-0000-4000-8000-000000000006","mode":"unit","quantity":"4"}
    ]'::jsonb);
    raise exception 'ASSERT_INSUFFICIENT_STOCK_NOT_REJECTED';
  exception when raise_exception then
    if sqlerrm <> 'INSUFFICIENT_STOCK' then raise; end if;
  end;
  if (select count(*) from public.sales) <> before_sales
    or (select count(*) from public.sale_items) <> before_items
    or (select count(*) from public.inventory_movements) <> before_moves
    or (select stock from public.product_presentations where id='10000000-0000-4000-8000-000000000005') <> before_weight
    or (select stock from public.product_presentations where id='10000000-0000-4000-8000-000000000006') <> before_unit
  then raise exception 'ASSERT_SALE_ROLLBACK_FAILED'; end if;
end $$;

-- Amount mode: server derives quantity, price and historical unit cost.
do $$
declare v jsonb; v_item public.sale_items%rowtype;
begin
  v := public.process_sale('transferencia','[{
    "presentation_id":"10000000-0000-4000-8000-000000000005",
    "mode":"amount","amount":"3000.00"
  }]'::jsonb);
  if v->>'total_amount' <> '3000.00' or v->>'total_cost' <> '2142.50'
    or v#>>'{items,0,stock_quantity}' <> '1.714'
  then raise exception 'ASSERT_AMOUNT_SALE_PRECISION: %',v; end if;
  if (select payment_method from public.sales where id=(v->>'sale_id')::uuid) <> 'transferencia'
  then raise exception 'ASSERT_PAYMENT_METHOD'; end if;
  select * into strict v_item
  from public.sale_items
  where id = (v#>>'{items,0,sale_item_id}')::uuid;
  if v_item.cost <> 2142.50
    or v_item.replacement_cost_snapshot <> 25000.00
    or v_item.presentation_weight_snapshot <> 20.000
    or v_item.cost_basis <> 'last_purchase'
    or v#>>'{items,0,replacement_cost_snapshot}' <> '25000.00'
    or v#>>'{items,0,presentation_weight_snapshot}' <> '20.000'
    or v#>>'{items,0,cost_basis}' <> 'last_purchase'
  then raise exception 'ASSERT_AMOUNT_SALE_COST_SNAPSHOT: %, %', v, row_to_json(v_item); end if;
end $$;

-- Invalid payloads are rejected before durable side effects.
do $$
begin
  begin perform public.process_sale('efectivo','[]'::jsonb);
    raise exception 'ASSERT_EMPTY_SALE_ALLOWED';
  exception when raise_exception then if sqlerrm <> 'INVALID_ITEMS' then raise; end if; end;
  begin perform public.process_sale('bitcoin','[{"presentation_id":"10000000-0000-4000-8000-000000000006","mode":"unit","quantity":"1"}]'::jsonb);
    raise exception 'ASSERT_BAD_PAYMENT_ALLOWED';
  exception when raise_exception then if sqlerrm <> 'INVALID_PAYMENT_METHOD' then raise; end if; end;
  begin perform public.process_purchase('10000000-0000-4000-8000-000000000002','BAD','[{"presentation_id":"10000000-0000-4000-8000-000000000005","quantity":"-1","unit_cost":"1.00"}]'::jsonb);
    raise exception 'ASSERT_NEGATIVE_PURCHASE_ALLOWED';
  exception when raise_exception then if sqlerrm <> 'INVALID_QUANTITY' then raise; end if; end;
end $$;

-- Merma and adjustment each create exactly one movement with the stock update.
do $$
declare v jsonb; v_count bigint; v_sum numeric; v_stock numeric;
begin
  v := public.record_shrinkage('10000000-0000-4000-8000-000000000005',0.500,'E2E shrinkage');
  if v->>'quantity' <> '-0.500' or v->>'stock_after' <> '237.786' then raise exception 'ASSERT_SHRINKAGE: %',v; end if;
  if (select quantity from public.inventory_movements where id=(v->>'movement_id')::uuid) <> -0.500 then raise exception 'ASSERT_SHRINKAGE_LEDGER'; end if;

  v := public.record_stock_adjustment('10000000-0000-4000-8000-000000000005',238.000,'E2E count');
  if v->>'quantity' <> '0.214' or v->>'stock_after' <> '238.000' then raise exception 'ASSERT_ADJUSTMENT: %',v; end if;

  select count(*),coalesce(sum(quantity),0) into v_count,v_sum from public.inventory_movements where presentation_id='10000000-0000-4000-8000-000000000005';
  select stock into v_stock from public.product_presentations where id='10000000-0000-4000-8000-000000000005';
  if v_count <> 5 or v_sum <> v_stock or v_stock <> 238.000 then raise exception 'ASSERT_KARDEX_RECONCILIATION count %, sum %, stock %',v_count,v_sum,v_stock; end if;
end $$;

-- Supplier removal deletes unused records and archives suppliers with purchase history.
do $$
declare v jsonb;
begin
  v := public.remove_supplier('10000000-0000-4000-8000-000000000012');
  if v->>'deleted' <> 'true'
    or exists (select 1 from public.suppliers where id='10000000-0000-4000-8000-000000000012')
  then raise exception 'ASSERT_UNUSED_SUPPLIER_NOT_DELETED: %',v; end if;

  v := public.remove_supplier('10000000-0000-4000-8000-000000000002');
  if v->>'archived' <> 'true'
    or (select active from public.suppliers where id='10000000-0000-4000-8000-000000000002')
  then raise exception 'ASSERT_USED_SUPPLIER_NOT_ARCHIVED: %',v; end if;

  begin
    perform public.process_purchase(
      '10000000-0000-4000-8000-000000000002','ARCHIVED-SUPPLIER',
      '[{"presentation_id":"10000000-0000-4000-8000-000000000006","quantity":"1","unit_cost":"5000.00"}]'::jsonb
    );
    raise exception 'ASSERT_ARCHIVED_SUPPLIER_ACCEPTED';
  exception when raise_exception then
    if sqlerrm <> 'SUPPLIER_NOT_FOUND' then raise; end if;
  end;
end $$;

-- Presentation creation preserves exact decimal strings in the RPC response and
-- records the opening balance in the same transaction.
do $$
declare v jsonb; v_presentation_id uuid;
begin
  v := public.create_product_presentation(
    '10000000-0000-4000-8000-000000000003',
    'E2E Bag 5kg', 5.000, 6250.00, 9000.00, 1800.00, 2.500
  );
  v_presentation_id := (v->>'id')::uuid;

  if jsonb_typeof(v->'weight_kg') <> 'string'
    or jsonb_typeof(v->'cost') <> 'string'
    or jsonb_typeof(v->'price') <> 'string'
    or jsonb_typeof(v->'price_per_kg') <> 'string'
    or jsonb_typeof(v->'stock') <> 'string'
    or v->>'weight_kg' <> '5.000'
    or v->>'cost' <> '6250.00'
    or v->>'price' <> '9000.00'
    or v->>'price_per_kg' <> '1800.00'
    or v->>'stock' <> '2.500'
  then raise exception 'ASSERT_PRESENTATION_DECIMAL_RESPONSE: %', v; end if;

  if (select stock from public.product_presentations where id = v_presentation_id) <> 2.500
    or (select quantity from public.inventory_movements
        where presentation_id = v_presentation_id and reference_type = 'opening_balance') <> 2.500
  then raise exception 'ASSERT_PRESENTATION_OPENING_BALANCE: %', v; end if;
end $$;

-- Last-purchase replacement cost is shared by every sale mode. Every line keeps
-- the definitive rounded cost and its operands after later purchases change the
-- current replacement cost. Profitability reads those historical line costs.
do $$
declare
  v_weight_sale jsonb;
  v_package_sale jsonb;
  v_unit_sale jsonb;
  v_new_weight_sale jsonb;
  v_new_package_sale jsonb;
  v_new_unit_sale jsonb;
  v_purchase jsonb;
  v_weight_item_id uuid;
  v_package_item_id uuid;
  v_unit_item_id uuid;
  v_report jsonb;
  v_report_cost numeric;
  v_stored_cost numeric;
  v_day date := (current_timestamp at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  v_weight_sale := public.process_sale(
    'efectivo',
    '[{"presentation_id":"10000000-0000-4000-8000-000000000005","mode":"weight","quantity":"2.555"}]'::jsonb
  );
  v_package_sale := public.process_sale(
    'efectivo',
    '[{"presentation_id":"10000000-0000-4000-8000-000000000005","mode":"package","quantity":"1"}]'::jsonb
  );
  v_unit_sale := public.process_sale(
    'efectivo',
    '[{"presentation_id":"10000000-0000-4000-8000-000000000006","mode":"unit","quantity":"1"}]'::jsonb
  );

  if v_weight_sale->>'total_cost' <> '3193.75'
    or v_package_sale->>'total_cost' <> '25000.00'
    or v_unit_sale->>'total_cost' <> '5000.00'
    or v_unit_sale#>>'{items,0,cost_basis}' <> 'opening_cost'
    or v_unit_sale#>'{items,0,presentation_weight_snapshot}' is distinct from 'null'::jsonb
  then
    raise exception 'ASSERT_ALL_SALE_MODES_OPENING_COST: %, %, %',
      v_weight_sale, v_package_sale, v_unit_sale;
  end if;

  v_weight_item_id := (v_weight_sale#>>'{items,0,sale_item_id}')::uuid;
  v_package_item_id := (v_package_sale#>>'{items,0,sale_item_id}')::uuid;
  v_unit_item_id := (v_unit_sale#>>'{items,0,sale_item_id}')::uuid;

  v_purchase := public.process_purchase(
    '10000000-0000-4000-8000-000000000013', 'E2E-NEW-WEIGHT-COST',
    '[{"presentation_id":"10000000-0000-4000-8000-000000000005","quantity":"1","unit_cost":"28000.00"}]'::jsonb
  );
  perform public.process_purchase(
    '10000000-0000-4000-8000-000000000013', 'E2E-NEW-UNIT-COST',
    '[{"presentation_id":"10000000-0000-4000-8000-000000000006","quantity":"1","unit_cost":"5500.00"}]'::jsonb
  );

  if v_purchase#>>'{items,0,unit_cost}' <> '28000.00'
    or (select cost from public.product_presentations where id = '10000000-0000-4000-8000-000000000005') <> 28000.00
    or (select cost from public.product_presentations where id = '10000000-0000-4000-8000-000000000006') <> 5500.00
  then raise exception 'ASSERT_PURCHASE_DID_NOT_REPLACE_COST: %', v_purchase; end if;

  if (select cost from public.sale_items where id = v_weight_item_id) <> 3193.75
    or (select replacement_cost_snapshot from public.sale_items where id = v_weight_item_id) <> 25000.00
    or (select presentation_weight_snapshot from public.sale_items where id = v_weight_item_id) <> 20.000
    or (select cost_basis from public.sale_items where id = v_weight_item_id) <> 'last_purchase'
    or (select cost from public.sale_items where id = v_package_item_id) <> 25000.00
    or (select replacement_cost_snapshot from public.sale_items where id = v_package_item_id) <> 25000.00
    or (select presentation_weight_snapshot from public.sale_items where id = v_package_item_id) <> 20.000
    or (select cost_basis from public.sale_items where id = v_package_item_id) <> 'last_purchase'
    or (select cost from public.sale_items where id = v_unit_item_id) <> 5000.00
    or (select replacement_cost_snapshot from public.sale_items where id = v_unit_item_id) <> 5000.00
    or (select presentation_weight_snapshot from public.sale_items where id = v_unit_item_id) is not null
    or (select cost_basis from public.sale_items where id = v_unit_item_id) <> 'opening_cost'
  then raise exception 'ASSERT_HISTORICAL_COST_CHANGED_AFTER_PURCHASE'; end if;

  v_new_weight_sale := public.process_sale(
    'efectivo',
    '[{"presentation_id":"10000000-0000-4000-8000-000000000005","mode":"amount","amount":"3000.00"}]'::jsonb
  );
  v_new_package_sale := public.process_sale(
    'efectivo',
    '[{"presentation_id":"10000000-0000-4000-8000-000000000005","mode":"package","quantity":"1"}]'::jsonb
  );
  v_new_unit_sale := public.process_sale(
    'efectivo',
    '[{"presentation_id":"10000000-0000-4000-8000-000000000006","mode":"unit","quantity":"1"}]'::jsonb
  );

  if v_new_weight_sale->>'total_cost' <> '2399.60'
    or v_new_weight_sale#>>'{items,0,replacement_cost_snapshot}' <> '28000.00'
    or v_new_weight_sale#>>'{items,0,cost_basis}' <> 'last_purchase'
    or v_new_package_sale->>'total_cost' <> '28000.00'
    or v_new_unit_sale->>'total_cost' <> '5500.00'
    or v_new_unit_sale#>>'{items,0,cost_basis}' <> 'last_purchase'
  then
    raise exception 'ASSERT_LATEST_PURCHASE_COST_NOT_USED: %, %, %',
      v_new_weight_sale, v_new_package_sale, v_new_unit_sale;
  end if;

  v_report := public.get_profitability_detail_report(v_day, v_day);
  select coalesce(sum((row->>'total_cost')::numeric), 0)
  into v_report_cost
  from jsonb_array_elements(v_report) row;
  select coalesce(sum(cost), 0)
  into v_stored_cost
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where s.created_at >= v_day::timestamp at time zone 'America/Argentina/Buenos_Aires'
    and s.created_at < (v_day + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires';
  if v_report_cost <> v_stored_cost then
    raise exception 'ASSERT_PROFITABILITY_RECALCULATED_CURRENT_COST: report %, stored %',
      v_report_cost, v_stored_cost;
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_report) row
    where (row->>'gross_profit')::numeric
      <> (row->>'total_amount')::numeric - (row->>'total_cost')::numeric
  ) then raise exception 'ASSERT_GROSS_PROFIT_SEMANTICS'; end if;
end $$;

-- Product removal is logical even with stock and transaction history. Historical
-- rows and presentation stock must remain intact.
do $$
declare
  v jsonb;
  v_stock numeric;
  v_sales bigint;
  v_purchases bigint;
  v_movements bigint;
  v_updated bigint;
begin
  select stock into v_stock
  from public.product_presentations
  where id = '10000000-0000-4000-8000-000000000005';
  select count(*) into v_sales from public.sale_items
  where product_id = '10000000-0000-4000-8000-000000000003';
  select count(*) into v_purchases from public.purchase_items
  where product_id = '10000000-0000-4000-8000-000000000003';
  select count(*) into v_movements from public.inventory_movements
  where product_id = '10000000-0000-4000-8000-000000000003';

  v := public.delete_product('10000000-0000-4000-8000-000000000003');

  if v->>'archived' <> 'true' or v->>'deleted' <> 'false'
    or (select status from public.products where id = '10000000-0000-4000-8000-000000000003') <> 'inactive'
    or (select stock from public.product_presentations where id = '10000000-0000-4000-8000-000000000005') <> v_stock
    or (select count(*) from public.sale_items where product_id = '10000000-0000-4000-8000-000000000003') <> v_sales
    or (select count(*) from public.purchase_items where product_id = '10000000-0000-4000-8000-000000000003') <> v_purchases
    or (select count(*) from public.inventory_movements where product_id = '10000000-0000-4000-8000-000000000003') <> v_movements
  then raise exception 'ASSERT_PRODUCT_LOGICAL_REMOVAL: %', v; end if;

  begin
    perform public.process_sale(
      'efectivo',
      '[{"presentation_id":"10000000-0000-4000-8000-000000000005","mode":"weight","quantity":"0.500"}]'::jsonb
    );
    raise exception 'ASSERT_ARCHIVED_PRODUCT_SALE_ALLOWED';
  exception when raise_exception then
    if sqlerrm <> 'INACTIVE_PRODUCT' then raise; end if;
  end;

  begin
    perform public.process_purchase(
      '10000000-0000-4000-8000-000000000013',
      'ARCHIVED-PRODUCT',
      '[{"presentation_id":"10000000-0000-4000-8000-000000000005","quantity":"1","unit_cost":"25000.00"}]'::jsonb
    );
    raise exception 'ASSERT_ARCHIVED_PRODUCT_PURCHASE_ALLOWED';
  exception when raise_exception then
    if sqlerrm <> 'INACTIVE_PRODUCT' then raise; end if;
  end;

  begin
    perform public.create_product_presentation(
      '10000000-0000-4000-8000-000000000003',
      'Archived variant', 1.000, 1.00, 1.00, 1.00, 0.000
    );
    raise exception 'ASSERT_ARCHIVED_PRODUCT_PRESENTATION_CREATED';
  exception when raise_exception then
    if sqlerrm <> 'PRODUCT_NOT_FOUND' then raise; end if;
  end;

  begin
    perform public.record_shrinkage(
      '10000000-0000-4000-8000-000000000005', 0.500, 'Archived product mutation'
    );
    raise exception 'ASSERT_ARCHIVED_PRODUCT_SHRINKAGE_ALLOWED';
  exception when raise_exception then
    if sqlerrm <> 'INACTIVE_PRODUCT' then raise; end if;
  end;

  begin
    perform public.record_stock_adjustment(
      '10000000-0000-4000-8000-000000000005', v_stock + 1, 'Archived product mutation'
    );
    raise exception 'ASSERT_ARCHIVED_PRODUCT_ADJUSTMENT_ALLOWED';
  exception when raise_exception then
    if sqlerrm <> 'INACTIVE_PRODUCT' then raise; end if;
  end;

  if (select count(*) from public.sale_items where product_id = '10000000-0000-4000-8000-000000000003') <> v_sales
    or (select count(*) from public.purchase_items where product_id = '10000000-0000-4000-8000-000000000003') <> v_purchases
    or (select stock from public.product_presentations where id = '10000000-0000-4000-8000-000000000005') <> v_stock
    or (select count(*) from public.inventory_movements where product_id = '10000000-0000-4000-8000-000000000003') <> v_movements
  then raise exception 'ASSERT_ARCHIVED_PRODUCT_TRANSACTION_CHANGED'; end if;

  update public.products
  set name = 'Archived product edited'
  where id = '10000000-0000-4000-8000-000000000003';
  get diagnostics v_updated = row_count;
  if v_updated <> 0 then
    raise exception 'ASSERT_ARCHIVED_PRODUCT_DIRECT_UPDATE_ALLOWED';
  end if;

  update public.product_presentations
  set price = price + 1
  where id = '10000000-0000-4000-8000-000000000005';
  get diagnostics v_updated = row_count;
  if v_updated <> 0 then
    raise exception 'ASSERT_ARCHIVED_PRESENTATION_DIRECT_UPDATE_ALLOWED';
  end if;
end $$;

reset role;

-- Even privileged application code cannot rewrite confirmed sale economics.
do $$
declare v_item_id uuid;
begin
  select id into strict v_item_id from public.sale_items order by created_at, id limit 1;
  begin
    update public.sale_items set cost = cost + 0.01 where id = v_item_id;
    raise exception 'ASSERT_SALE_ITEM_SNAPSHOT_UPDATE_WAS_ALLOWED';
  exception when raise_exception then
    if sqlerrm <> 'SALE_ITEM_SNAPSHOT_IMMUTABLE' then raise; end if;
  end;
end $$;

rollback;
