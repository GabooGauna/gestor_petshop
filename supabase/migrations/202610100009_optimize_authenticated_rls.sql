-- Reviewer hardening: evaluate auth.uid() once per statement instead of once per row.
-- Policy semantics and role grants remain unchanged.

alter policy categories_authenticated_all on public.categories
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

alter policy suppliers_authenticated_select on public.suppliers
  using ((select auth.uid()) is not null);
alter policy suppliers_authenticated_insert on public.suppliers
  with check ((select auth.uid()) is not null);
alter policy suppliers_authenticated_update on public.suppliers
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

alter policy products_authenticated_select on public.products
  using ((select auth.uid()) is not null);
alter policy products_authenticated_insert on public.products
  with check ((select auth.uid()) is not null);
alter policy products_authenticated_update on public.products
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

alter policy presentations_authenticated_select on public.product_presentations
  using ((select auth.uid()) is not null);
alter policy presentations_authenticated_insert on public.product_presentations
  with check ((select auth.uid()) is not null);
alter policy presentations_authenticated_update on public.product_presentations
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

alter policy sales_authenticated_read on public.sales
  using ((select auth.uid()) is not null);
alter policy sale_items_authenticated_read on public.sale_items
  using ((select auth.uid()) is not null);
alter policy purchases_authenticated_read on public.purchases
  using ((select auth.uid()) is not null);
alter policy purchase_items_authenticated_read on public.purchase_items
  using ((select auth.uid()) is not null);
alter policy movements_authenticated_read on public.inventory_movements
  using ((select auth.uid()) is not null);
