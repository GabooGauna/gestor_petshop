\set ON_ERROR_STOP on

do $$
declare
  v_case record;
begin
  if exists (
    select 1 from petstock_test.outcomes
    where scenario like 'presentation_%' and actor <> 'authenticated'
  ) then raise exception 'ASSERT_022_CONCURRENCY_ROLE'; end if;

  for v_case in
    select * from (values
      ('presentation_archive_sale',       'sale',       '70000000-0000-4000-8000-000000000013'::uuid, 2::numeric, 10::numeric),
      ('presentation_archive_purchase',   'purchase',   '70000000-0000-4000-8000-000000000014'::uuid, 0::numeric, 10::numeric),
      ('presentation_archive_adjustment', 'adjustment', '70000000-0000-4000-8000-000000000015'::uuid, 2::numeric, 10::numeric),
      ('presentation_archive_shrinkage',  'shrinkage',  '70000000-0000-4000-8000-000000000016'::uuid, 2::numeric, 10::numeric)
    ) x(scenario, worker, presentation_id, expected_stock, expected_cost)
  loop
    if (select status from public.product_presentations where id = v_case.presentation_id) <> 'inactive'
       or (select stock from public.product_presentations where id = v_case.presentation_id) <> v_case.expected_stock
       or (select cost from public.product_presentations where id = v_case.presentation_id) <> v_case.expected_cost
       or (select outcome from petstock_test.outcomes where scenario = v_case.scenario and worker = v_case.worker) <> 'INACTIVE_PRESENTATION'
       or (select duration_ms from petstock_test.outcomes where scenario = v_case.scenario and worker = v_case.worker) < 900
    then raise exception 'ASSERT_022_CONCURRENCY_ARCHIVE_WIN_FAILED: %', v_case.scenario; end if;
  end loop;

  if exists (select 1 from public.sale_items where presentation_id = '70000000-0000-4000-8000-000000000013')
     or exists (select 1 from public.purchase_items where presentation_id = '70000000-0000-4000-8000-000000000014')
     or (select count(*) from public.inventory_movements where presentation_id = '70000000-0000-4000-8000-000000000013') <> 1
     or (select count(*) from public.inventory_movements where presentation_id = '70000000-0000-4000-8000-000000000014') <> 0
     or (select count(*) from public.inventory_movements where presentation_id = '70000000-0000-4000-8000-000000000015') <> 1
     or (select count(*) from public.inventory_movements where presentation_id = '70000000-0000-4000-8000-000000000016') <> 1
  then raise exception 'ASSERT_022_CONCURRENCY_ATOMICITY_FAILED'; end if;

  if (select outcome from petstock_test.outcomes where scenario = 'presentation_sale_wins' and worker = 'sale') <> 'ok'
     or (select outcome from petstock_test.outcomes where scenario = 'presentation_sale_wins' and worker = 'archive') <> 'ok'
     or (select duration_ms from petstock_test.outcomes where scenario = 'presentation_sale_wins' and worker = 'archive') < 900
     or (select status from public.product_presentations where id = '70000000-0000-4000-8000-000000000017') <> 'inactive'
     or (select stock from public.product_presentations where id = '70000000-0000-4000-8000-000000000017') <> 1
     or (select count(*) from public.sale_items where presentation_id = '70000000-0000-4000-8000-000000000017') <> 1
     or (select count(*) from public.inventory_movements where presentation_id = '70000000-0000-4000-8000-000000000017' and type = 'venta') <> 1
  then raise exception 'ASSERT_022_CONCURRENCY_MUTATION_WIN_FAILED'; end if;
end $$;

drop trigger petstock_test_delay_presentation_archive on public.product_presentations;
drop trigger petstock_test_delay_presentation_sale on public.sales;
drop function petstock_test.delay_presentation_archive();
drop function petstock_test.delay_presentation_sale();
