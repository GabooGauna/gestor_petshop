-- Server-authoritative and atomic inventory transactions.

create or replace function public.process_sale(p_payment_method text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_sale uuid; v_item_id uuid; v_item jsonb; v_ids uuid[]; v_pid uuid; v_mode text;
  v_input numeric; v_stock numeric(10,3); v_commercial numeric(10,3);
  v_price numeric(12,2); v_subtotal numeric(12,2); v_cost numeric(12,2);
  v_total numeric(12,2):=0; v_total_cost numeric(12,2):=0; v_row record;
  v_results jsonb:='[]'::jsonb;
begin
  if (select relrowsecurity from pg_catalog.pg_class where oid='public.sales'::regclass) and auth.uid() is null then
    raise exception using errcode='P0001',message='AUTHENTICATION_REQUIRED';
  end if;
  if coalesce(p_payment_method,'') not in ('efectivo','transferencia','debito','credito','mercado_pago','otro') then
    raise exception using errcode='P0001',message='INVALID_PAYMENT_METHOD';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' then
    raise exception using errcode='P0001',message='INVALID_ITEMS';
  end if;
  if jsonb_array_length(p_items) not between 1 and 100 then
    raise exception using errcode='P0001',message='INVALID_ITEMS';
  end if;
  select array_agg((x->>'presentation_id')::uuid order by (x->>'presentation_id')::uuid) into v_ids
  from jsonb_array_elements(p_items)x
  where jsonb_typeof(x)='object' and (x->>'presentation_id')~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  if coalesce(cardinality(v_ids),0)<>jsonb_array_length(p_items) then raise exception using errcode='P0001',message='INVALID_ITEMS'; end if;
  if cardinality(v_ids)<>(select count(distinct x) from unnest(v_ids)x) then raise exception using errcode='P0001',message='DUPLICATE_PRESENTATION'; end if;
  perform id from public.product_presentations where id=any(v_ids) order by id for update;
  if (select count(*) from public.product_presentations where id=any(v_ids))<>cardinality(v_ids) then raise exception using errcode='P0001',message='PRESENTATION_NOT_FOUND'; end if;

  insert into public.sales(total_amount,total_cost,payment_method) values(0,0,p_payment_method) returning id into v_sale;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_pid:=(v_item->>'presentation_id')::uuid; v_mode:=v_item->>'mode';
    if coalesce(v_mode,'') not in ('amount','weight','package','unit') then raise exception using errcode='P0001',message='MODE_PRODUCT_MISMATCH'; end if;
    if v_mode='amount' then
      if coalesce(v_item->>'amount','')!~'^[0-9]+[.][0-9]{2}$' then raise exception using errcode='P0001',message='INVALID_AMOUNT'; end if;
      v_input:=(v_item->>'amount')::numeric;
    else
      if coalesce(v_item->>'quantity','')!~'^[0-9]+([.][0-9]{1,3})?$' then raise exception using errcode='P0001',message='INVALID_QUANTITY'; end if;
      v_input:=(v_item->>'quantity')::numeric;
    end if;
    if v_input<=0 then raise exception using errcode='P0001',message=case when v_mode='amount' then 'INVALID_AMOUNT' else 'INVALID_QUANTITY' end; end if;

    select pp.*,p.type product_type,p.status product_status into strict v_row
    from public.product_presentations pp join public.products p on p.id=pp.product_id where pp.id=v_pid;
    if v_row.product_status is distinct from 'active' then raise exception using errcode='P0001',message='INACTIVE_PRODUCT'; end if;
    if v_mode in ('amount','weight') then
      if v_row.product_type<>'weight' then raise exception using errcode='P0001',message='MODE_PRODUCT_MISMATCH'; end if;
      if v_row.weight_kg is null or v_row.weight_kg<=0 then raise exception using errcode='P0001',message='MODE_PRODUCT_MISMATCH'; end if;
      if coalesce(v_row.price_per_kg,0)<=0 then raise exception using errcode='P0001',message='PRICE_NOT_CONFIGURED'; end if;
      v_price:=v_row.price_per_kg;
      if v_mode='amount' then v_subtotal:=v_input::numeric(12,2); v_stock:=round(v_input/v_price,3); v_commercial:=v_stock;
      else v_stock:=v_input::numeric(10,3); v_commercial:=v_stock; v_subtotal:=round(v_stock*v_price,2); end if;
      v_cost:=round((v_row.cost/v_row.weight_kg)*v_stock,2);
    elsif v_mode='package' then
      if v_row.product_type<>'weight' then raise exception using errcode='P0001',message='MODE_PRODUCT_MISMATCH'; end if;
      if v_input<>trunc(v_input) then raise exception using errcode='P0001',message='INVALID_QUANTITY'; end if;
      if v_row.weight_kg is null or v_row.weight_kg<=0 then raise exception using errcode='P0001',message='MODE_PRODUCT_MISMATCH'; end if;
      if v_row.price<=0 then raise exception using errcode='P0001',message='PRICE_NOT_CONFIGURED'; end if;
      v_commercial:=v_input; v_stock:=round(v_input*v_row.weight_kg,3); v_price:=v_row.price;
      v_subtotal:=round(v_input*v_price,2); v_cost:=round(v_input*v_row.cost,2);
    else
      if v_row.product_type<>'unit' then raise exception using errcode='P0001',message='MODE_PRODUCT_MISMATCH'; end if;
      if v_input<>trunc(v_input) then raise exception using errcode='P0001',message='INVALID_QUANTITY'; end if;
      if v_row.price<=0 then raise exception using errcode='P0001',message='PRICE_NOT_CONFIGURED'; end if;
      v_commercial:=v_input; v_stock:=v_input; v_price:=v_row.price;
      v_subtotal:=round(v_input*v_price,2); v_cost:=round(v_input*v_row.cost,2);
    end if;
    if v_stock<=0 then raise exception using errcode='P0001',message='INVALID_QUANTITY'; end if;
    if v_row.stock<v_stock then raise exception using errcode='P0001',message='INSUFFICIENT_STOCK'; end if;
    update public.product_presentations set stock=stock-v_stock where id=v_pid;
    insert into public.sale_items(sale_id,product_id,presentation_id,quantity,unit_price,subtotal,cost,sale_mode,commercial_quantity)
    values(v_sale,v_row.product_id,v_pid,v_stock,v_price,v_subtotal,v_cost,v_mode,v_commercial) returning id into v_item_id;
    insert into public.inventory_movements(product_id,presentation_id,type,quantity,reason,reference_type,reference_id)
    values(v_row.product_id,v_pid,'venta',-v_stock,'Venta '||v_sale,'sale',v_sale);
    v_total:=v_total+v_subtotal; v_total_cost:=v_total_cost+v_cost;
    v_results:=v_results||jsonb_build_array(jsonb_build_object('sale_item_id',v_item_id,'product_id',v_row.product_id,'presentation_id',v_pid,'mode',v_mode,'commercial_quantity',v_commercial::text,'stock_quantity',v_stock::text,'unit_price',v_price::text,'subtotal',v_subtotal::text,'line_cost',v_cost::text,'stock_after',(v_row.stock-v_stock)::text));
  end loop;
  update public.sales set total_amount=v_total,total_cost=v_total_cost where id=v_sale;
  return jsonb_build_object('sale_id',v_sale,'total_amount',v_total::text,'total_cost',v_total_cost::text,'items',v_results);
exception when numeric_value_out_of_range then raise exception using errcode='P0001',message='NUMERIC_OVERFLOW';
end $$;

create or replace function public.process_purchase(p_supplier_id uuid,p_invoice_number text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_purchase uuid; v_item_id uuid; v_item jsonb; v_ids uuid[]; v_pid uuid; v_qty numeric;
  v_cost numeric(12,2); v_subtotal numeric(12,2); v_added numeric(10,3); v_total numeric(12,2):=0;
  v_row record; v_results jsonb:='[]'::jsonb;
begin
  if (select relrowsecurity from pg_catalog.pg_class where oid='public.purchases'::regclass) and auth.uid() is null then raise exception using errcode='P0001',message='AUTHENTICATION_REQUIRED'; end if;
  if not exists(select 1 from public.suppliers where id=p_supplier_id) then raise exception using errcode='P0001',message='SUPPLIER_NOT_FOUND'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception using errcode='P0001',message='INVALID_ITEMS'; end if;
  if jsonb_array_length(p_items) not between 1 and 100 then raise exception using errcode='P0001',message='INVALID_ITEMS'; end if;
  select array_agg((x->>'presentation_id')::uuid order by (x->>'presentation_id')::uuid) into v_ids from jsonb_array_elements(p_items)x
  where jsonb_typeof(x)='object' and (x->>'presentation_id')~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  if coalesce(cardinality(v_ids),0)<>jsonb_array_length(p_items) then raise exception using errcode='P0001',message='INVALID_ITEMS'; end if;
  if cardinality(v_ids)<>(select count(distinct x) from unnest(v_ids)x) then raise exception using errcode='P0001',message='DUPLICATE_PRESENTATION'; end if;
  perform id from public.product_presentations where id=any(v_ids) order by id for update;
  if (select count(*) from public.product_presentations where id=any(v_ids))<>cardinality(v_ids) then raise exception using errcode='P0001',message='PRESENTATION_NOT_FOUND'; end if;
  insert into public.purchases(supplier_id,total_amount,invoice_number) values(p_supplier_id,0,nullif(btrim(p_invoice_number),'')) returning id into v_purchase;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(v_item->>'quantity','')!~'^[0-9]+$' then raise exception using errcode='P0001',message='INVALID_QUANTITY'; end if;
    if coalesce(v_item->>'unit_cost','')!~'^[0-9]+[.][0-9]{2}$' then raise exception using errcode='P0001',message='INVALID_UNIT_COST'; end if;
    v_pid:=(v_item->>'presentation_id')::uuid; v_qty:=(v_item->>'quantity')::numeric; v_cost:=(v_item->>'unit_cost')::numeric;
    if v_qty<=0 then raise exception using errcode='P0001',message='INVALID_QUANTITY'; end if;
    if v_cost<=0 then raise exception using errcode='P0001',message='INVALID_UNIT_COST'; end if;
    select pp.*,p.type product_type,p.status product_status into strict v_row from public.product_presentations pp join public.products p on p.id=pp.product_id where pp.id=v_pid;
    if v_row.product_status is distinct from 'active' then raise exception using errcode='P0001',message='INACTIVE_PRODUCT'; end if;
    if v_row.product_type='weight' then
      if v_row.weight_kg is null or v_row.weight_kg<=0 then raise exception using errcode='P0001',message='INVALID_QUANTITY'; end if;
      v_added:=round(v_qty*v_row.weight_kg,3);
    elsif v_row.product_type='unit' then v_added:=v_qty;
    else raise exception using errcode='P0001',message='INVALID_QUANTITY'; end if;
    v_subtotal:=round(v_qty*v_cost,2);
    update public.product_presentations set stock=stock+v_added,cost=v_cost where id=v_pid;
    insert into public.purchase_items(purchase_id,product_id,presentation_id,quantity,unit_cost,subtotal) values(v_purchase,v_row.product_id,v_pid,v_qty,v_cost,v_subtotal) returning id into v_item_id;
    insert into public.inventory_movements(product_id,presentation_id,type,quantity,reason,reference_type,reference_id) values(v_row.product_id,v_pid,'compra',v_added,'Compra '||v_purchase,'purchase',v_purchase);
    v_total:=v_total+v_subtotal;
    v_results:=v_results||jsonb_build_array(jsonb_build_object('purchase_item_id',v_item_id,'product_id',v_row.product_id,'presentation_id',v_pid,'quantity',v_qty::text,'unit_cost',v_cost::text,'subtotal',v_subtotal::text,'stock_added',v_added::text,'stock_after',(v_row.stock+v_added)::text));
  end loop;
  update public.purchases set total_amount=v_total where id=v_purchase;
  return jsonb_build_object('purchase_id',v_purchase,'total_amount',v_total::text,'items',v_results);
exception when numeric_value_out_of_range then raise exception using errcode='P0001',message='NUMERIC_OVERFLOW';
end $$;

create or replace function public.record_shrinkage(p_presentation_id uuid,p_quantity numeric,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v record; v_id uuid:=gen_random_uuid(); v_q numeric(10,3);
begin
  if (select relrowsecurity from pg_catalog.pg_class where oid='public.inventory_movements'::regclass) and auth.uid() is null then raise exception using errcode='P0001',message='AUTHENTICATION_REQUIRED'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception using errcode='P0001',message='REASON_REQUIRED'; end if;
  if p_quantity is null or p_quantity<=0 or p_quantity<>round(p_quantity,3) then raise exception using errcode='P0001',message='INVALID_QUANTITY'; end if;
  v_q:=p_quantity; select pp.*,p.type product_type into v from public.product_presentations pp join public.products p on p.id=pp.product_id where pp.id=p_presentation_id for update;
  if not found then raise exception using errcode='P0001',message='PRESENTATION_NOT_FOUND'; end if;
  if v.product_type='unit' and v_q<>trunc(v_q) then raise exception using errcode='P0001',message='INVALID_QUANTITY'; end if;
  if v.stock<v_q then raise exception using errcode='P0001',message='INSUFFICIENT_STOCK'; end if;
  update public.product_presentations set stock=stock-v_q where id=p_presentation_id;
  insert into public.inventory_movements(id,product_id,presentation_id,type,quantity,reason,reference_type,reference_id) values(v_id,v.product_id,p_presentation_id,'merma',-v_q,btrim(p_reason),'shrinkage',v_id);
  return jsonb_build_object('movement_id',v_id,'product_id',v.product_id,'presentation_id',p_presentation_id,'quantity',(-v_q)::text,'stock_before',v.stock::text,'stock_after',(v.stock-v_q)::text);
exception when numeric_value_out_of_range then raise exception using errcode='P0001',message='INVALID_QUANTITY';
end $$;

create or replace function public.record_stock_adjustment(p_presentation_id uuid,p_physical_stock numeric,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v record; v_id uuid:=gen_random_uuid(); v_stock numeric(10,3); v_delta numeric(10,3);
begin
  if (select relrowsecurity from pg_catalog.pg_class where oid='public.inventory_movements'::regclass) and auth.uid() is null then raise exception using errcode='P0001',message='AUTHENTICATION_REQUIRED'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception using errcode='P0001',message='REASON_REQUIRED'; end if;
  if p_physical_stock is null or p_physical_stock<0 or p_physical_stock<>round(p_physical_stock,3) then raise exception using errcode='P0001',message='INVALID_PHYSICAL_STOCK'; end if;
  v_stock:=p_physical_stock; select pp.*,p.type product_type into v from public.product_presentations pp join public.products p on p.id=pp.product_id where pp.id=p_presentation_id for update;
  if not found then raise exception using errcode='P0001',message='PRESENTATION_NOT_FOUND'; end if;
  if v.product_type='unit' and v_stock<>trunc(v_stock) then raise exception using errcode='P0001',message='INVALID_PHYSICAL_STOCK'; end if;
  v_delta:=v_stock-v.stock; if v_delta=0 then raise exception using errcode='P0001',message='NO_STOCK_CHANGE'; end if;
  update public.product_presentations set stock=v_stock where id=p_presentation_id;
  insert into public.inventory_movements(id,product_id,presentation_id,type,quantity,reason,reference_type,reference_id) values(v_id,v.product_id,p_presentation_id,'ajuste',v_delta,btrim(p_reason),'adjustment',v_id);
  return jsonb_build_object('movement_id',v_id,'product_id',v.product_id,'presentation_id',p_presentation_id,'quantity',v_delta::text,'stock_before',v.stock::text,'stock_after',v_stock::text);
exception when numeric_value_out_of_range then raise exception using errcode='P0001',message='INVALID_PHYSICAL_STOCK';
end $$;

revoke all on function public.process_sale(text,jsonb),public.process_purchase(uuid,text,jsonb),public.record_shrinkage(uuid,numeric,text),public.record_stock_adjustment(uuid,numeric,text) from public;
grant execute on function public.process_sale(text,jsonb),public.process_purchase(uuid,text,jsonb),public.record_shrinkage(uuid,numeric,text),public.record_stock_adjustment(uuid,numeric,text) to anon,authenticated;
