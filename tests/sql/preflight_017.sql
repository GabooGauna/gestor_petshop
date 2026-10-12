\set ON_ERROR_STOP on

-- This script is intentionally read-only. It proves that the supplied schema-only
-- baseline has the dependencies required by 018-020 and has not already crossed
-- any of those migration boundaries.
begin transaction read only;

do $$
declare
  v_missing_tables text[];
  v_missing_functions text[];
begin
  if current_setting('petstock.environment', true) is distinct from 'e2e' then
    raise exception 'PETSTOCK_E2E_DATABASE_REQUIRED';
  end if;

  if current_database() !~ '^petstock_(e2e|test)_[a-z0-9_]+$' then
    raise exception 'PETSTOCK_DISPOSABLE_DATABASE_NAME_REQUIRED: %', current_database();
  end if;

  select array_agg(required_object order by required_object)
  into v_missing_tables
  from unnest(array[
    'public.categories', 'public.suppliers', 'public.products',
    'public.product_presentations', 'public.sales', 'public.sale_items',
    'public.purchases', 'public.purchase_items', 'public.inventory_movements'
  ]) required_object
  where to_regclass(required_object) is null;

  select array_agg(required_object order by required_object)
  into v_missing_functions
  from unnest(array[
    'auth.uid()',
    'public.process_sale(text,jsonb)', 'public.process_purchase(uuid,text,jsonb)',
    'public.create_product_presentation(uuid,text,numeric,numeric,numeric,numeric,numeric)',
    'public.delete_product(uuid)', 'public.record_shrinkage(uuid,numeric,text)',
    'public.record_stock_adjustment(uuid,numeric,text)',
    'public.get_profitability_detail_report(date,date)'
  ]) required_object
  where to_regprocedure(required_object) is null;

  if v_missing_tables is not null or v_missing_functions is not null then
    raise exception 'PETSTOCK_BASELINE_017_MISSING_DEPENDENCIES: tables %, functions %',
      v_missing_tables, v_missing_functions;
  end if;

  if obj_description(
      'public.create_product_presentation(uuid,text,numeric,numeric,numeric,numeric,numeric)'::regprocedure,
      'pg_proc'
    ) is distinct from
      'Atomically creates an additional presentation and its optional opening inventory movement.' then
    raise exception 'PETSTOCK_BASELINE_NOT_AT_017: migration 018 boundary is not pristine';
  end if;

  if obj_description('public.delete_product(uuid)'::regprocedure, 'pg_proc') is not null then
    raise exception 'PETSTOCK_BASELINE_NOT_AT_017: migration 019 appears applied';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sale_items'
      and column_name in (
        'replacement_cost_snapshot', 'presentation_weight_snapshot', 'cost_basis'
      )
  ) then
    raise exception 'PETSTOCK_BASELINE_NOT_AT_017: migration 020 appears applied';
  end if;
end $$;

-- Discrepancies here are blockers. The runner prints the detailed rows before
-- this aggregate assertion aborts.
select pp.id as presentation_id, pp.cost as catalog_cost,
       latest.unit_cost as latest_purchase_cost, latest.created_at, latest.purchase_id
from public.product_presentations pp
join lateral (
  select pi.unit_cost, p.created_at, p.id as purchase_id
  from public.purchase_items pi
  join public.purchases p on p.id = pi.purchase_id
  where pi.presentation_id = pp.id
  order by p.created_at desc, p.id desc, pi.id desc
  limit 1
) latest on true
where pp.cost is distinct from latest.unit_cost
order by pp.id;

select s.id as sale_id, s.total_amount, sums.total_amount as item_amount,
       s.total_cost, sums.total_cost as item_cost
from public.sales s
cross join lateral (
  select coalesce(sum(si.subtotal), 0)::numeric(12,2) as total_amount,
         coalesce(sum(si.cost), 0)::numeric(12,2) as total_cost
  from public.sale_items si where si.sale_id = s.id
) sums
where s.total_amount is distinct from sums.total_amount
   or s.total_cost is distinct from sums.total_cost
order by s.id;

do $$
declare v_cost_mismatches bigint; v_sale_mismatches bigint; v_negative_stock bigint;
begin
  select count(*) into v_cost_mismatches
  from public.product_presentations pp
  join lateral (
    select pi.unit_cost
    from public.purchase_items pi join public.purchases p on p.id = pi.purchase_id
    where pi.presentation_id = pp.id
    order by p.created_at desc, p.id desc, pi.id desc limit 1
  ) latest on true
  where pp.cost is distinct from latest.unit_cost;

  select count(*) into v_sale_mismatches
  from public.sales s
  cross join lateral (
    select coalesce(sum(si.subtotal), 0)::numeric(12,2) amount,
           coalesce(sum(si.cost), 0)::numeric(12,2) cost
    from public.sale_items si where si.sale_id = s.id
  ) sums
  where s.total_amount is distinct from sums.amount or s.total_cost is distinct from sums.cost;

  select count(*) into v_negative_stock
  from public.product_presentations where stock < 0;

  if v_cost_mismatches + v_sale_mismatches + v_negative_stock > 0 then
    raise exception
      'PETSTOCK_PREFLIGHT_DISCREPANCIES: cost %, sales %, negative_stock %',
      v_cost_mismatches, v_sale_mismatches, v_negative_stock;
  end if;
end $$;

rollback;
