-- Deterministic reconciliation from the read-only snapshot captured at
-- 2026-10-09T15:12:58Z. Every old value is asserted before any correction.
do $$
declare
  v record;
  v_actual_stock numeric(10,3);
  v_actual_total numeric;
  v_actual_product uuid;
  v_created_at timestamptz;
  v_bad_count bigint;
begin
  for v in
    select * from (values
      ('322ae52a-3533-417f-9bef-56661f4d2fbc'::uuid,20.000::numeric,0.000::numeric,20.000::numeric,'d4ba6093-4582-47a0-9bd8-0d31e1c13566'::uuid),
      ('3c7456e8-3047-4004-ad41-46b3777a83fa'::uuid,20.000::numeric,0.000::numeric,20.000::numeric,'2530703e-4316-45bd-983d-283890c34aa7'::uuid),
      ('7be784ef-fcc4-400e-8766-6f4d3c15d54a'::uuid,20.000::numeric,0.000::numeric,20.000::numeric,'90596379-4220-423c-b0d8-4ac26c5e8907'::uuid),
      ('8e956ee6-994b-4176-b7ee-2aa2527d2b40'::uuid,20.000::numeric,0.000::numeric,20.000::numeric,'c6e144ba-7884-48f6-a9b3-8349eebda30a'::uuid),
      ('9d4b1854-c5e5-4cf2-81ec-519685fd1482'::uuid,90.000::numeric,30.000::numeric,60.000::numeric,'75e26183-199d-4afa-ba72-84a03bd56026'::uuid),
      ('ad7297ff-24ee-48c7-8003-c004cfa45e7e'::uuid,20.000::numeric,0.000::numeric,20.000::numeric,'0b028111-81e4-41ac-be35-39425d4de2d3'::uuid),
      ('bd908f80-7346-41ab-802a-535be48360ca'::uuid,20.000::numeric,0.000::numeric,20.000::numeric,'71b85aa1-6aef-4ae8-aa0a-23b4c936de6b'::uuid),
      ('f435be60-7f71-4e23-a671-21effa4b24d1'::uuid,20.000::numeric,0.000::numeric,20.000::numeric,'d70d8ac5-f241-4917-ae45-e97b8526dab6'::uuid)
    ) s(presentation_id,current_stock,movement_total,opening_delta,product_id)
  loop
    select pp.stock,pp.product_id into v_actual_stock,v_actual_product
    from public.product_presentations pp where pp.id=v.presentation_id for update;
    if not found or v_actual_stock is distinct from v.current_stock or v_actual_product is distinct from v.product_id then
      raise exception using errcode='P0001',message='RECONCILIATION_SNAPSHOT_MISMATCH',
        detail=format('Presentation %s no longer matches stock/product snapshot.',v.presentation_id);
    end if;
    select coalesce(sum(im.quantity),0),
           coalesce(min(im.created_at)-interval '1 microsecond','2026-10-09T15:12:58Z'::timestamptz)
      into v_actual_total,v_created_at
    from public.inventory_movements im where im.presentation_id=v.presentation_id;
    if v_actual_total is distinct from v.movement_total then
      raise exception using errcode='P0001',message='RECONCILIATION_SNAPSHOT_MISMATCH',
        detail=format('Presentation %s movement total changed: expected %s, got %s.',v.presentation_id,v.movement_total,v_actual_total);
    end if;
    if exists(select 1 from public.inventory_movements im where im.reference_type='opening_balance' and im.reference_id=v.presentation_id and im.presentation_id=v.presentation_id) then
      raise exception using errcode='P0001',message='RECONCILIATION_ALREADY_APPLIED';
    end if;
    insert into public.inventory_movements(product_id,presentation_id,type,quantity,reason,reference_type,reference_id,created_at)
    values(v.product_id,v.presentation_id,'ajuste',v.opening_delta,'Saldo inicial reconciliado — snapshot 2026-10-09','opening_balance',v.presentation_id,v_created_at);
  end loop;

  -- The only historical sale whose cost can be reconstructed from the captured
  -- bag cost and weight. Supplier NULLs remain untouched: no evidence exists.
  perform 1 from public.sales s
  where s.id='8ec90971-e4a6-456a-97a9-ad90e8edb94a'::uuid
    and s.total_cost=45450.00 and s.payment_method='Efectivo'
  for update;
  if not found then raise exception using errcode='P0001',message='SALE_RECONCILIATION_SNAPSHOT_MISMATCH'; end if;

  perform 1
  from public.sale_items si
  join public.product_presentations pp on pp.id=si.presentation_id
  where si.id='16794946-1d61-44f3-856d-db7ced05de02'::uuid
    and si.sale_id='8ec90971-e4a6-456a-97a9-ad90e8edb94a'::uuid
    and si.presentation_id='89cef8d0-3534-4f6b-bb6c-28a04a6f706d'::uuid
    and si.quantity=1.818 and si.cost=25000.00 and si.subtotal=3000.00 and si.unit_price=1650.00
    and pp.weight_kg=20.000 and pp.cost=25000.00
  for update of si,pp;
  if not found then raise exception using errcode='P0001',message='SALE_ITEM_RECONCILIATION_SNAPSHOT_MISMATCH'; end if;

  update public.sale_items set cost=2272.50,sale_mode='amount',commercial_quantity=1.818
  where id='16794946-1d61-44f3-856d-db7ced05de02'::uuid;
  update public.sales set total_cost=2272.50,payment_method='efectivo'
  where id='8ec90971-e4a6-456a-97a9-ad90e8edb94a'::uuid;

  select count(*) into v_bad_count
  from public.product_presentations pp
  left join (select presentation_id,sum(quantity) total from public.inventory_movements group by presentation_id)m
    on m.presentation_id=pp.id
  where pp.stock is distinct from coalesce(m.total,0);
  if v_bad_count<>0 then
    raise exception using errcode='P0001',message='RECONCILIATION_FINAL_ASSERTION_FAILED',
      detail=format('%s presentations still differ from their movement ledger.',v_bad_count);
  end if;
end $$;
