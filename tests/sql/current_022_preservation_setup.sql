create table petstock_test.current_022_snapshot as
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
  (select coalesce(sum(stock),0) from public.product_presentations) stock_total,
  (select coalesce(sum(cost),0) from public.product_presentations) presentation_cost_total,
  (select coalesce(sum(total_amount),0) from public.sales) sales_amount_total,
  (select coalesce(sum(total_cost),0) from public.sales) sales_cost_total,
  (select coalesce(sum(total_amount),0) from public.purchases) purchase_amount_total,
  (select coalesce(sum(quantity),0) from public.inventory_movements) movement_quantity_total;
