do $$
declare v_columns integer; v_triggers integer;
begin
  select count(*) into v_columns
  from information_schema.columns
  where table_schema = 'public' and table_name = 'sale_items'
    and column_name in ('replacement_cost_snapshot','presentation_weight_snapshot','cost_basis');

  select count(*) into v_triggers
  from pg_trigger
  where tgrelid = 'public.sale_items'::regclass and not tgisinternal
    and tgname in ('sale_items_capture_cost_snapshot','sale_items_protect_cost_snapshot');

  if v_columns <> 3 or v_triggers <> 2
    or has_column_privilege('authenticated', 'public.product_presentations', 'cost', 'UPDATE')
    or not has_function_privilege('authenticated', 'public.process_sale(text,jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'public.process_sale(text,jsonb)', 'EXECUTE') then
    raise exception 'PETSTOCK_020_POSTCONDITION_FAILED: columns %, triggers %', v_columns, v_triggers;
  end if;
end $$;
