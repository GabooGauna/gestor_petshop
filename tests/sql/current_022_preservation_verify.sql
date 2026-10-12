do $$
declare
  v_before petstock_test.current_022_snapshot%rowtype;
  v_after petstock_test.current_022_snapshot%rowtype;
begin
  select * into strict v_before from petstock_test.current_022_snapshot;
  select
    (select count(*) from public.categories),
    (select count(*) from public.suppliers),
    (select count(*) from public.products),
    (select count(*) from public.product_presentations),
    (select count(*) from public.sales),
    (select count(*) from public.sale_items),
    (select count(*) from public.purchases),
    (select count(*) from public.purchase_items),
    (select count(*) from public.inventory_movements),
    (select coalesce(sum(stock),0) from public.product_presentations),
    (select coalesce(sum(cost),0) from public.product_presentations),
    (select coalesce(sum(total_amount),0) from public.sales),
    (select coalesce(sum(total_cost),0) from public.sales),
    (select coalesce(sum(total_amount),0) from public.purchases),
    (select coalesce(sum(quantity),0) from public.inventory_movements)
  into v_after;

  if v_after is distinct from v_before then
    raise exception 'PETSTOCK_022_CURRENT_DATA_PRESERVATION_FAILED';
  end if;
  if (select count(*) from public.product_presentations where status='active') <> v_before.presentations
     or exists (select 1 from public.product_presentations where status<>'active')
  then
    raise exception 'PETSTOCK_022_EXISTING_PRESENTATIONS_NOT_ACTIVE';
  end if;
end $$;
