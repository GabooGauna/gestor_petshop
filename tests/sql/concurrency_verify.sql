\set ON_ERROR_STOP on
do $$
declare v_success bigint; v_rejected bigint;
begin
  if exists(select 1 from petstock_test.outcomes where actor <> 'authenticated') then
    raise exception 'ASSERT_CONCURRENCY_DID_NOT_USE_AUTHENTICATED_ROLE';
  end if;

  select count(*) filter(where outcome='ok'), count(*) filter(where outcome='INSUFFICIENT_STOCK')
  into v_success,v_rejected from petstock_test.outcomes where scenario='sale_sale';
  if v_success<>1 or v_rejected<>1
    or (select stock from public.product_presentations where id='20000000-0000-4000-8000-000000000021')<>0
    or (select count(*) from public.inventory_movements where presentation_id='20000000-0000-4000-8000-000000000021' and type='venta')<>1
    or (select duration_ms from petstock_test.outcomes where scenario='sale_sale' and worker='b')<900
  then raise exception 'ASSERT_CONCURRENT_SALE_SALE_FAILED: success %, rejected %',v_success,v_rejected; end if;

  if (select count(*) from petstock_test.outcomes where scenario='purchase_sale' and outcome='ok')<>2
    or (select stock from public.product_presentations where id='20000000-0000-4000-8000-000000000022')<>0
    or (select cost from public.product_presentations where id='20000000-0000-4000-8000-000000000022')<>12
    or not exists(select 1 from public.sale_items where presentation_id='20000000-0000-4000-8000-000000000022' and replacement_cost_snapshot=12)
    or (select duration_ms from petstock_test.outcomes where scenario='purchase_sale' and worker='sale')<900
  then raise exception 'ASSERT_CONCURRENT_PURCHASE_SALE_FAILED'; end if;

  if (select count(*) from petstock_test.outcomes where scenario='minimum_purchase' and outcome='ok')<>2
    or (select duration_ms from petstock_test.outcomes where scenario='minimum_purchase' and worker='purchase')<900
    or (select stock from public.product_presentations where id='20000000-0000-4000-8000-000000000030')<>3
    or (select cost from public.product_presentations where id='20000000-0000-4000-8000-000000000030')<>12
    or (select min_stock from public.product_presentations where id='20000000-0000-4000-8000-000000000030')<>4
    or (select count(*) from public.purchase_items where presentation_id='20000000-0000-4000-8000-000000000030')<>1
    or (select count(*) from public.inventory_movements where presentation_id='20000000-0000-4000-8000-000000000030' and type='compra')<>1
  then raise exception 'ASSERT_CONCURRENT_MINIMUM_PURCHASE_FAILED'; end if;

  if (select status from public.products where id='20000000-0000-4000-8000-000000000003')<>'inactive'
    or (select stock from public.product_presentations where id='20000000-0000-4000-8000-000000000023')<>2
    or (select outcome from petstock_test.outcomes where scenario='archive_mutation' and worker='mutation')<>'INACTIVE_PRODUCT'
    or (select duration_ms from petstock_test.outcomes where scenario='archive_mutation' and worker='mutation')<900
  then raise exception 'ASSERT_CONCURRENT_ARCHIVE_MUTATION_FAILED'; end if;

  if (select status from public.products where id='20000000-0000-4000-8000-000000000006')<>'inactive'
    or (select stock from public.product_presentations where id='20000000-0000-4000-8000-000000000026')<>2
    or (select outcome from petstock_test.outcomes where scenario='archive_sale' and worker='sale')<>'INACTIVE_PRODUCT'
    or (select duration_ms from petstock_test.outcomes where scenario='archive_sale' and worker='sale')<900
    or exists(select 1 from public.sale_items where presentation_id='20000000-0000-4000-8000-000000000026')
    or exists(select 1 from public.inventory_movements where presentation_id='20000000-0000-4000-8000-000000000026' and type='venta')
    or exists(select 1 from petstock_test.outcomes where scenario='archive_sale' and worker='sale' and before_rows is distinct from after_rows)
  then raise exception 'ASSERT_CONCURRENT_ARCHIVE_SALE_FAILED'; end if;

  if (select status from public.products where id='20000000-0000-4000-8000-000000000007')<>'inactive'
    or (select stock from public.product_presentations where id='20000000-0000-4000-8000-000000000027')<>0
    or (select cost from public.product_presentations where id='20000000-0000-4000-8000-000000000027')<>10
    or (select outcome from petstock_test.outcomes where scenario='archive_purchase' and worker='purchase')<>'INACTIVE_PRODUCT'
    or (select duration_ms from petstock_test.outcomes where scenario='archive_purchase' and worker='purchase')<900
    or exists(select 1 from public.purchase_items where presentation_id='20000000-0000-4000-8000-000000000027')
    or exists(select 1 from public.inventory_movements where presentation_id='20000000-0000-4000-8000-000000000027' and type='compra')
    or exists(select 1 from petstock_test.outcomes where scenario='archive_purchase' and worker='purchase' and before_rows is distinct from after_rows)
  then raise exception 'ASSERT_CONCURRENT_ARCHIVE_PURCHASE_FAILED'; end if;

  if (select status from public.products where id='20000000-0000-4000-8000-000000000008')<>'inactive'
    or (select price from public.product_presentations where id='20000000-0000-4000-8000-000000000028')<>20
    or (select stock from public.product_presentations where id='20000000-0000-4000-8000-000000000028')<>2
    or (select outcome from petstock_test.outcomes where scenario='archive_direct_update' and worker='update')<>'INACTIVE_PRODUCT'
    or (select duration_ms from petstock_test.outcomes where scenario='archive_direct_update' and worker='update')<900
    or (select count(*) from public.inventory_movements where presentation_id='20000000-0000-4000-8000-000000000028')<>1
  then raise exception 'ASSERT_CONCURRENT_ARCHIVE_DIRECT_UPDATE_FAILED'; end if;

  if (select status from public.products where id='20000000-0000-4000-8000-000000000009')<>'inactive'
    or (select stock from public.product_presentations where id='20000000-0000-4000-8000-000000000029')<>2
    or (select outcome from petstock_test.outcomes where scenario='archive_adjustment' and worker='adjustment')<>'INACTIVE_PRODUCT'
    or (select duration_ms from petstock_test.outcomes where scenario='archive_adjustment' and worker='adjustment')<900
    or (select count(*) from public.inventory_movements where presentation_id='20000000-0000-4000-8000-000000000029')<>1
  then raise exception 'ASSERT_CONCURRENT_ARCHIVE_ADJUSTMENT_FAILED'; end if;

  if (select count(*) from petstock_test.outcomes where scenario='multi_order' and outcome='ok')<>2
    or exists(select 1 from public.product_presentations where id in
      ('20000000-0000-4000-8000-000000000024','20000000-0000-4000-8000-000000000025') and stock<>0)
    or (select count(*) from public.sale_items where presentation_id in
      ('20000000-0000-4000-8000-000000000024','20000000-0000-4000-8000-000000000025'))<>4
    or (select duration_ms from petstock_test.outcomes where scenario='multi_order' and worker='ba')<900
  then raise exception 'ASSERT_CONCURRENT_MULTI_PRESENTATION_ORDER_FAILED'; end if;

  if (select count(*) from petstock_test.outcomes where scenario='create_archive_create_wins' and outcome='ok')<>2
    or (select status from public.products where id='20000000-0000-4000-8000-000000000012')<>'inactive'
    or (select count(*) from public.product_presentations where product_id='20000000-0000-4000-8000-000000000012' and name='Concurrent create winner')<>1
    or (select duration_ms from petstock_test.outcomes where scenario='create_archive_create_wins' and worker='archive')<900
  then raise exception 'ASSERT_CONCURRENT_CREATE_ARCHIVE_CREATE_WINNER_FAILED'; end if;

  if (select status from public.products where id='20000000-0000-4000-8000-000000000013')<>'inactive'
    or (select outcome from petstock_test.outcomes where scenario='create_archive_archive_wins' and worker='create')<>'PRODUCT_NOT_FOUND'
    or (select duration_ms from petstock_test.outcomes where scenario='create_archive_archive_wins' and worker='create')<900
    or exists(select 1 from public.product_presentations where product_id='20000000-0000-4000-8000-000000000013' and name='Concurrent archive winner')
  then raise exception 'ASSERT_CONCURRENT_CREATE_ARCHIVE_ARCHIVE_WINNER_FAILED'; end if;

  if exists(
    select 1 from public.product_presentations pp
    where pp.id::text like '20000000-0000-4000-8000-0000000000%'
      and pp.stock <> coalesce((select sum(im.quantity) from public.inventory_movements im where im.presentation_id=pp.id),0)
  ) then raise exception 'ASSERT_CONCURRENT_KARDEX_RECONCILIATION_FAILED'; end if;
end $$;

drop trigger petstock_test_delay_purchase on public.purchase_items;
drop trigger petstock_test_delay_archive on public.products;
drop trigger petstock_test_delay_sale on public.sales;
drop trigger petstock_test_delay_presentation_create on public.product_presentations;
drop trigger petstock_test_delay_min_stock_update on public.product_presentations;
drop function petstock_test.delay_purchase();
drop function petstock_test.delay_archive();
drop function petstock_test.delay_sale();
drop function petstock_test.delay_presentation_create();
drop function petstock_test.delay_min_stock_update();
