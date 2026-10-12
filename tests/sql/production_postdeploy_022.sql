\set ON_ERROR_STOP on

begin read only;

do $$
begin
  if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='product_presentations'
        and column_name='status' and is_nullable='NO'
        and column_default like '%active%'
    )
    or not exists (
      select 1 from pg_constraint
      where conrelid='public.product_presentations'::regclass
        and conname='product_presentations_status_check' and convalidated
    )
    or not exists (
      select 1 from pg_trigger
      where tgrelid='public.product_presentations'::regclass
        and tgname='presentations_enforce_lifecycle_on_update' and not tgisinternal
    )
    or to_regprocedure('public.archive_presentation(uuid)') is null
    or to_regprocedure('public.reactivate_presentation(uuid)') is null
  then
    raise exception 'PETSTOCK_022_STRUCTURE_MISSING';
  end if;

  if has_function_privilege('anon','public.archive_presentation(uuid)','EXECUTE')
     or has_function_privilege('anon','public.reactivate_presentation(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.archive_presentation(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.reactivate_presentation(uuid)','EXECUTE')
     or has_column_privilege('authenticated','public.product_presentations','status','UPDATE')
     or has_column_privilege('authenticated','public.product_presentations','stock','UPDATE')
     or has_column_privilege('authenticated','public.product_presentations','cost','UPDATE')
     or has_column_privilege('authenticated','public.product_presentations','product_id','UPDATE')
     or not has_column_privilege('authenticated','public.product_presentations','name','UPDATE')
     or not has_column_privilege('authenticated','public.product_presentations','weight_kg','UPDATE')
     or not has_column_privilege('authenticated','public.product_presentations','price','UPDATE')
     or not has_column_privilege('authenticated','public.product_presentations','price_per_kg','UPDATE')
  then
    raise exception 'PETSTOCK_022_PRIVILEGE_MISMATCH';
  end if;

  if position(
      'pp.status = ''active''' in
      pg_get_functiondef('public.get_dashboard_analytics(date,date)'::regprocedure)
    ) = 0
    or position(
      'product_presentations.status' in
      pg_get_functiondef('public.get_profitability_detail_report(date,date)'::regprocedure)
    ) > 0
    or position(
      'product_presentations.status' in
      pg_get_functiondef('public.get_inventory_movement_report(date,date,text,uuid,integer,integer)'::regprocedure)
    ) > 0
  then
    raise exception 'PETSTOCK_022_REPORT_FILTER_MISMATCH';
  end if;
end $$;

do $$
begin
  if exists (select 1 from public.product_presentations where status not in ('active','inactive'))
     or exists (select 1 from public.product_presentations where stock < 0)
  then
    raise exception 'PETSTOCK_022_PRESENTATION_STATE_INVALID';
  end if;
  if exists (
    select 1
    from public.product_presentations pp
    left join (
      select presentation_id, sum(quantity) quantity
      from public.inventory_movements
      where presentation_id is not null
      group by presentation_id
    ) m on m.presentation_id=pp.id
    where pp.stock is distinct from coalesce(m.quantity,0)
  ) then
    raise exception 'PETSTOCK_022_STOCK_KARDEX_MISMATCH';
  end if;
  if exists (
    select 1
    from public.sales s
    left join public.sale_items si on si.sale_id=s.id
    group by s.id
    having s.total_amount is distinct from coalesce(sum(si.subtotal),0)
        or s.total_cost is distinct from coalesce(sum(si.cost),0)
  ) then
    raise exception 'PETSTOCK_022_SALE_TOTAL_MISMATCH';
  end if;
end $$;

select jsonb_build_object(
  'status','passed',
  'active_presentations',(select count(*) from public.product_presentations where status='active'),
  'inactive_presentations',(select count(*) from public.product_presentations where status='inactive'),
  'archived_stock',(select coalesce(sum(stock),0) from public.product_presentations where status='inactive'),
  'sales',(select count(*) from public.sales),
  'purchases',(select count(*) from public.purchases),
  'movements',(select count(*) from public.inventory_movements)
);

rollback;
