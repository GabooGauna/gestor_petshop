-- Read-only structural postconditions for migration 022.

do $$
begin
  if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'product_presentations'
        and column_name = 'status' and is_nullable = 'NO'
        and column_default like '%active%'
    )
    or not exists (
      select 1 from pg_constraint
      where conrelid = 'public.product_presentations'::regclass
        and conname = 'product_presentations_status_check'
        and convalidated
    )
    or not exists (
      select 1 from pg_trigger
      where tgrelid = 'public.product_presentations'::regclass
        and tgname = 'presentations_enforce_lifecycle_on_update'
        and not tgisinternal
    )
    or to_regprocedure('public.archive_presentation(uuid)') is null
    or to_regprocedure('public.reactivate_presentation(uuid)') is null
    or has_function_privilege('anon', 'public.archive_presentation(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.reactivate_presentation(uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.archive_presentation(uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.reactivate_presentation(uuid)', 'EXECUTE')
    or has_column_privilege('authenticated', 'public.product_presentations', 'status', 'UPDATE')
    or has_column_privilege('authenticated', 'public.product_presentations', 'id', 'UPDATE')
    or has_column_privilege('authenticated', 'public.product_presentations', 'product_id', 'UPDATE')
    or has_column_privilege('authenticated', 'public.product_presentations', 'cost', 'UPDATE')
    or has_column_privilege('authenticated', 'public.product_presentations', 'stock', 'UPDATE')
    or has_column_privilege('authenticated', 'public.product_presentations', 'created_at', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.product_presentations', 'name', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.product_presentations', 'weight_kg', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.product_presentations', 'price', 'UPDATE')
    or not has_column_privilege('authenticated', 'public.product_presentations', 'price_per_kg', 'UPDATE')
    or position(
      'pp.status = ''active''' in
      pg_get_functiondef('public.get_dashboard_analytics(date,date)'::regprocedure)
    ) = 0
  then
    raise exception 'PETSTOCK_022_POSTCONDITION_FAILED';
  end if;

  if obj_description('public.delete_presentation(uuid)'::regprocedure, 'pg_proc') is distinct from
      'Compatibility alias that archives a presentation; physical deletion is no longer supported.'
  then
    raise exception 'PETSTOCK_022_DELETE_COMPATIBILITY_FAILED';
  end if;
end $$;

