do $$
begin
  if obj_description('public.delete_product(uuid)'::regprocedure, 'pg_proc') is distinct from
      'Archives an active product without deleting stock, movements, purchases or sales history.'
    or obj_description('public.record_shrinkage(uuid,numeric,text)'::regprocedure, 'pg_proc') is distinct from
      'Atomically records shrinkage for an active product presentation.'
    or obj_description('public.record_stock_adjustment(uuid,numeric,text)'::regprocedure, 'pg_proc') is distinct from
      'Atomically records a physical-stock adjustment for an active product presentation.'
    or not exists (
      select 1 from pg_trigger
      where tgrelid = 'public.product_presentations'::regclass
        and tgname = 'presentations_require_active_product_on_update'
        and not tgisinternal
    )
    or has_function_privilege(
      'authenticated', 'public.ensure_presentation_product_active_on_update()', 'EXECUTE'
    )
    or has_function_privilege(
      'anon', 'public.ensure_presentation_product_active_on_update()', 'EXECUTE'
    )
    or has_column_privilege(
      'authenticated', 'public.product_presentations', 'product_id', 'UPDATE'
    )
    or obj_description('public.delete_presentation(uuid)'::regprocedure, 'pg_proc') is distinct from
      'Deletes an unused presentation only while its product remains active.'
    or position(
      'pg_advisory_xact_lock(1347638356' in
      pg_get_functiondef('public.delete_product(uuid)'::regprocedure)
    ) = 0 then
    raise exception 'PETSTOCK_019_POSTCONDITION_FAILED';
  end if;
end $$;
