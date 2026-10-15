do $$
declare
  v_before petstock_test.current_023_snapshot%rowtype;
  v_after petstock_test.current_023_snapshot%rowtype;
begin
  select * into strict v_before from petstock_test.current_023_snapshot;
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
    (select coalesce(sum(stock), 0) from public.product_presentations),
    (select coalesce(sum(cost), 0) from public.product_presentations),
    (select coalesce(sum(total_amount), 0) from public.sales),
    (select coalesce(sum(total_cost), 0) from public.sales),
    (select coalesce(sum(total_amount), 0) from public.purchases),
    (select coalesce(sum(quantity), 0) from public.inventory_movements),
    (select md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by x.id), '')) from public.categories x),
    (select md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by x.id), '')) from public.suppliers x),
    (select md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by x.id), '')) from public.products x),
    (
      select md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by x.id), ''))
      from (
        select id, product_id, name, weight_kg, cost, price, price_per_kg, stock, status, created_at
        from public.product_presentations
      ) x
    ),
    (select md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by x.id), '')) from public.sales x),
    (select md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by x.id), '')) from public.sale_items x),
    (select md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by x.id), '')) from public.purchases x),
    (select md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by x.id), '')) from public.purchase_items x),
    (select md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by x.id), '')) from public.inventory_movements x)
  into v_after;

  if v_after is distinct from v_before then
    raise exception 'PETSTOCK_023_CURRENT_DATA_PRESERVATION_FAILED';
  end if;

  if exists (
    select 1
    from public.product_presentations pp
    join public.products p on p.id = pp.product_id
    where pp.min_stock is distinct from coalesce(p.min_stock, 0::numeric)
  ) then
    raise exception 'PETSTOCK_023_CURRENT_BACKFILL_FAILED';
  end if;
end $$;
