-- Read-only structural and preservation postconditions for migration 023.

do $$
begin
  if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'product_presentations'
        and column_name = 'min_stock' and is_nullable = 'NO'
        and numeric_scale = 3
    )
    or not exists (
      select 1 from pg_constraint
      where conrelid = 'public.product_presentations'::regclass
        and conname = 'product_presentations_min_stock_nonnegative'
    )
    or not exists (
      select 1 from pg_trigger
      where tgrelid = 'public.product_presentations'::regclass
        and tgname = 'presentations_validate_min_stock'
        and not tgisinternal and tgenabled = 'O'
    )
    or not exists (
      select 1 from pg_trigger
      where tgrelid = 'public.product_presentations'::regclass
        and tgname = 'presentations_require_active_product_on_update'
        and not tgisinternal and tgenabled = 'O'
    )
    or not exists (
      select 1 from pg_trigger
      where tgrelid = 'public.product_presentations'::regclass
        and tgname = 'presentations_enforce_lifecycle_on_update'
        and not tgisinternal and tgenabled = 'O'
    )
    or to_regprocedure('public.create_product_presentation(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric)') is null
    or position(
      'pg_advisory_xact_lock(1347638356' in
      pg_get_functiondef('public.create_product_presentation(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric)'::regprocedure)
    ) = 0
    or position(
      'for key share' in
      lower(pg_get_functiondef('public.create_product_presentation(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric)'::regprocedure))
    ) = 0
    or not has_function_privilege('authenticated', 'public.create_product_presentation(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric)', 'EXECUTE')
    or has_function_privilege('anon', 'public.create_product_presentation(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric)', 'EXECUTE')
    or not has_column_privilege('authenticated', 'public.product_presentations', 'min_stock', 'UPDATE')
    or has_column_privilege('authenticated', 'public.product_presentations', 'stock', 'UPDATE')
    or position(
      'pp.stock <= pp.min_stock' in
      pg_get_functiondef('public.get_dashboard_analytics(date,date)'::regprocedure)
    ) = 0
    or position(
      'greatest(coalesce(p.min_stock' in
      pg_get_functiondef('public.get_dashboard_analytics(date,date)'::regprocedure)
    ) > 0
  then
    raise exception 'PETSTOCK_023_POSTCONDITION_FAILED';
  end if;

  if exists (
    select 1
    from public.product_presentations pp
    join public.products p on p.id = pp.product_id
    where pp.min_stock is distinct from coalesce(p.min_stock, 0::numeric)
  ) then
    raise exception 'PETSTOCK_023_BACKFILL_FAILED';
  end if;

  if exists (
    select 1
    from public.product_presentations pp
    join public.products p on p.id = pp.product_id
    where p.type = 'unit'
      and pp.min_stock <> trunc(pp.min_stock)
  ) then
    raise exception 'PETSTOCK_023_UNIT_MIN_STOCK_FAILED';
  end if;
end $$;
