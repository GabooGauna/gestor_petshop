-- Gate for a schema-only dump of the audited remote state: historical 018 and
-- 019 are present in their earlier forms, while 020 and corrective 021 are absent.
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
    'public.delete_product(uuid)', 'public.delete_presentation(uuid)',
    'public.record_shrinkage(uuid,numeric,text)',
    'public.record_stock_adjustment(uuid,numeric,text)',
    'public.get_profitability_detail_report(date,date)'
  ]) required_object
  where to_regprocedure(required_object) is null;

  if v_missing_tables is not null or v_missing_functions is not null then
    raise exception 'PETSTOCK_CURRENT_SCHEMA_MISSING_DEPENDENCIES: tables %, functions %',
      v_missing_tables, v_missing_functions;
  end if;

  if obj_description(
      'public.create_product_presentation(uuid,text,numeric,numeric,numeric,numeric,numeric)'::regprocedure,
      'pg_proc'
    ) is distinct from
      'Atomically creates a presentation and serializes exact decimal values as JSON strings.'
    or position(
      'pg_advisory_xact_lock' in pg_get_functiondef(
        'public.create_product_presentation(uuid,text,numeric,numeric,numeric,numeric,numeric)'::regprocedure
      )
    ) > 0 then
    raise exception 'PETSTOCK_CURRENT_SCHEMA_018_STATE_MISMATCH';
  end if;

  if obj_description('public.delete_product(uuid)'::regprocedure, 'pg_proc') is distinct from
      'Archives an active product without deleting stock, movements, purchases or sales history.'
    or position(
      'pg_advisory_xact_lock' in
      pg_get_functiondef('public.delete_product(uuid)'::regprocedure)
    ) > 0
    or to_regprocedure('public.ensure_presentation_product_active_on_update()') is not null
    or exists (
      select 1 from pg_trigger
      where tgrelid = 'public.product_presentations'::regclass
        and tgname = 'presentations_require_active_product_on_update'
        and not tgisinternal
    )
    or not has_column_privilege(
      'authenticated', 'public.product_presentations', 'product_id', 'UPDATE'
    ) then
    raise exception 'PETSTOCK_CURRENT_SCHEMA_019_STATE_MISMATCH';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sale_items'
      and column_name in (
        'replacement_cost_snapshot', 'presentation_weight_snapshot', 'cost_basis'
      )
  )
  or to_regprocedure('public.capture_sale_item_cost_snapshot()') is not null
  or to_regprocedure('public.protect_sale_item_cost_snapshot()') is not null then
    raise exception 'PETSTOCK_CURRENT_SCHEMA_020_ALREADY_PRESENT';
  end if;
end $$;

rollback;
