\set ON_ERROR_STOP on

begin read only;

do $$
begin
  if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'product_presentations'
        and column_name = 'min_stock' and is_nullable = 'NO' and numeric_scale = 3
    )
    or not exists (
      select 1 from pg_constraint
      where conrelid = 'public.product_presentations'::regclass
        and conname = 'product_presentations_min_stock_nonnegative' and convalidated
    )
    or not exists (
      select 1 from pg_trigger
      where tgrelid = 'public.product_presentations'::regclass
        and tgname = 'presentations_validate_min_stock' and not tgisinternal and tgenabled = 'O'
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
    or not has_function_privilege(
      'authenticated',
      'public.create_product_presentation(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.create_product_presentation(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric)',
      'EXECUTE'
    )
    or not has_column_privilege('authenticated', 'public.product_presentations', 'min_stock', 'UPDATE')
    or has_column_privilege('authenticated', 'public.product_presentations', 'stock', 'UPDATE')
    or position(
      'pp.stock <= pp.min_stock' in
      pg_get_functiondef('public.get_dashboard_analytics(date,date)'::regprocedure)
    ) = 0
  then
    raise exception 'PETSTOCK_023_STRUCTURE_OR_PRIVILEGE_MISMATCH';
  end if;

  if exists (
    select 1
    from public.product_presentations pp
    join public.products p on p.id = pp.product_id
    where pp.min_stock is distinct from coalesce(p.min_stock, 0::numeric)
  ) then
    raise exception 'PETSTOCK_023_BACKFILL_MISMATCH';
  end if;
end $$;

do $$
begin
  if exists (select 1 from public.product_presentations where stock < 0 or min_stock < 0) then
    raise exception 'PETSTOCK_023_NEGATIVE_STOCK_OR_MINIMUM';
  end if;
  if exists (
    select 1
    from public.product_presentations pp
    left join (
      select presentation_id, sum(quantity) quantity
      from public.inventory_movements
      where presentation_id is not null
      group by presentation_id
    ) m on m.presentation_id = pp.id
    where pp.stock is distinct from coalesce(m.quantity, 0)
  ) then
    raise exception 'PETSTOCK_023_STOCK_KARDEX_MISMATCH';
  end if;
  if exists (
    select 1
    from public.sales s
    left join public.sale_items si on si.sale_id = s.id
    group by s.id
    having s.total_amount is distinct from coalesce(sum(si.subtotal), 0)
        or s.total_cost is distinct from coalesce(sum(si.cost), 0)
  ) then
    raise exception 'PETSTOCK_023_SALE_TOTAL_MISMATCH';
  end if;
end $$;

select jsonb_build_object(
  'status', 'passed',
  'presentations', (select count(*) from public.product_presentations),
  'active_presentations', (select count(*) from public.product_presentations where status = 'active'),
  'inactive_presentations', (select count(*) from public.product_presentations where status = 'inactive'),
  'low_stock_alerts', (
    select count(*)
    from public.product_presentations pp
    join public.products p on p.id = pp.product_id
    where p.status = 'active' and pp.status = 'active' and pp.stock <= pp.min_stock
  ),
  'sales', (select count(*) from public.sales),
  'purchases', (select count(*) from public.purchases),
  'movements', (select count(*) from public.inventory_movements)
);

rollback;
