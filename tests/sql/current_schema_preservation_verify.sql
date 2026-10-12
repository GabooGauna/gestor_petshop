do $$
begin
  if not exists (
    select 1
    from public.product_presentations
    where id = '21000000-0000-4000-8000-000000000004'
      and product_id = '21000000-0000-4000-8000-000000000003'
      and name = 'Preservation presentation'
      and weight_kg is null and cost = 12.00 and price = 20.00
      and price_per_kg is null and stock = 9.000
      and created_at = '2026-10-01 10:00:00+00'::timestamptz
  ) then raise exception 'PETSTOCK_PRESERVATION_PRESENTATION_FAILED'; end if;

  if not exists (
    select 1 from public.purchases p
    join public.purchase_items pi on pi.purchase_id = p.id
    where p.id = '21000000-0000-4000-8000-000000000005'
      and p.total_amount = 120.00 and p.invoice_number = 'PRESERVE-001'
      and pi.id = '21000000-0000-4000-8000-000000000006'
      and pi.quantity = 10.000 and pi.unit_cost = 12.00 and pi.subtotal = 120.00
  ) then raise exception 'PETSTOCK_PRESERVATION_PURCHASE_FAILED'; end if;

  if not exists (
    select 1 from public.sales s
    join public.sale_items si on si.sale_id = s.id
    where s.id = '21000000-0000-4000-8000-000000000007'
      and s.total_amount = 20.00 and s.total_cost = 12.00 and s.payment_method = 'efectivo'
      and si.id = '21000000-0000-4000-8000-000000000008'
      and si.quantity = 1.000 and si.unit_price = 20.00
      and si.subtotal = 20.00 and si.cost = 12.00
      and si.sale_mode = 'unit' and si.commercial_quantity = 1.000
      and si.replacement_cost_snapshot is null
      and si.presentation_weight_snapshot is null
      and si.cost_basis is null
  ) then raise exception 'PETSTOCK_PRESERVATION_HISTORICAL_SALE_FAILED'; end if;

  if (select count(*) from public.inventory_movements
      where presentation_id = '21000000-0000-4000-8000-000000000004') <> 2
    or (select sum(quantity) from public.inventory_movements
        where presentation_id = '21000000-0000-4000-8000-000000000004') <> 9.000 then
    raise exception 'PETSTOCK_PRESERVATION_KARDEX_FAILED';
  end if;

  if (select count(*) from public.categories where id::text like '21000000-%') <> 1
    or (select count(*) from public.suppliers where id::text like '21000000-%') <> 1
    or (select count(*) from public.products where id::text like '21000000-%') <> 1
    or (select count(*) from public.product_presentations where id::text like '21000000-%') <> 1
    or (select count(*) from public.purchases where id::text like '21000000-%') <> 1
    or (select count(*) from public.purchase_items where id::text like '21000000-%') <> 1
    or (select count(*) from public.sales where id::text like '21000000-%') <> 1
    or (select count(*) from public.sale_items where id::text like '21000000-%') <> 1 then
    raise exception 'PETSTOCK_PRESERVATION_ROW_COUNTS_FAILED';
  end if;
end $$;
