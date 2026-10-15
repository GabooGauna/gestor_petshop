create table petstock_test.current_023_snapshot as
select
  (select count(*) from public.categories) categories,
  (select count(*) from public.suppliers) suppliers,
  (select count(*) from public.products) products,
  (select count(*) from public.product_presentations) presentations,
  (select count(*) from public.sales) sales,
  (select count(*) from public.sale_items) sale_items,
  (select count(*) from public.purchases) purchases,
  (select count(*) from public.purchase_items) purchase_items,
  (select count(*) from public.inventory_movements) movements,
  (select coalesce(sum(stock), 0) from public.product_presentations) stock_total,
  (select coalesce(sum(cost), 0) from public.product_presentations) presentation_cost_total,
  (select coalesce(sum(total_amount), 0) from public.sales) sales_amount_total,
  (select coalesce(sum(total_cost), 0) from public.sales) sales_cost_total,
  (select coalesce(sum(total_amount), 0) from public.purchases) purchase_amount_total,
  (select coalesce(sum(quantity), 0) from public.inventory_movements) movement_quantity_total,
  (select md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by x.id), '')) from public.categories x) categories_hash,
  (select md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by x.id), '')) from public.suppliers x) suppliers_hash,
  (select md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by x.id), '')) from public.products x) products_hash,
  (
    select md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by x.id), ''))
    from (
      select id, product_id, name, weight_kg, cost, price, price_per_kg, stock, status, created_at
      from public.product_presentations
    ) x
  ) presentations_hash,
  (select md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by x.id), '')) from public.sales x) sales_hash,
  (select md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by x.id), '')) from public.sale_items x) sale_items_hash,
  (select md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by x.id), '')) from public.purchases x) purchases_hash,
  (select md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by x.id), '')) from public.purchase_items x) purchase_items_hash,
  (select md5(coalesce(string_agg(to_jsonb(x)::text, E'\n' order by x.id), '')) from public.inventory_movements x) movements_hash;
