-- Keep exact NUMERIC values as decimal strings at the JSON boundary.
-- This replaces only the response serialization; creation remains atomic.

create or replace function public.create_product_presentation(
  p_product_id uuid,
  p_name text,
  p_weight_kg numeric,
  p_cost numeric,
  p_price numeric,
  p_price_per_kg numeric,
  p_initial_stock numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_presentation public.product_presentations%rowtype;
  v_opening_id uuid;
  v_initial_stock numeric(10,3);
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'AUTHENTICATION_REQUIRED';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id and status = 'active'
  for key share;

  if not found then
    raise exception using errcode = 'P0001', message = 'PRODUCT_NOT_FOUND';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception using errcode = 'P0001', message = 'PRESENTATION_NAME_REQUIRED';
  end if;
  if p_initial_stock is null or p_initial_stock < 0 or p_initial_stock <> round(p_initial_stock, 3) then
    raise exception using errcode = 'P0001', message = 'INVALID_INITIAL_STOCK';
  end if;
  if p_cost is null or p_cost < 0 or p_cost <> round(p_cost, 2)
    or p_price is null or p_price < 0 or p_price <> round(p_price, 2)
    or (p_price_per_kg is not null and (p_price_per_kg < 0 or p_price_per_kg <> round(p_price_per_kg, 2))) then
    raise exception using errcode = 'P0001', message = 'INVALID_PRICE';
  end if;
  if v_product.type = 'weight' and (p_weight_kg is null or p_weight_kg <= 0 or p_weight_kg <> round(p_weight_kg, 3)) then
    raise exception using errcode = 'P0001', message = 'PETSTOCK_WEIGHT_REQUIRED';
  end if;
  if v_product.type = 'unit' and (p_weight_kg is not null or p_price_per_kg is not null) then
    raise exception using errcode = 'P0001', message = 'PETSTOCK_UNIT_PRESENTATION_HAS_WEIGHT_FIELDS';
  end if;
  if v_product.type = 'unit' and p_initial_stock <> trunc(p_initial_stock) then
    raise exception using errcode = 'P0001', message = 'INVALID_UNIT_STOCK';
  end if;

  v_initial_stock := p_initial_stock;

  insert into public.product_presentations(
    product_id, name, weight_kg, cost, price, price_per_kg, stock
  ) values (
    v_product.id, btrim(p_name), p_weight_kg, p_cost, p_price, p_price_per_kg, v_initial_stock
  ) returning * into v_presentation;

  if v_initial_stock > 0 then
    v_opening_id := gen_random_uuid();
    insert into public.inventory_movements(
      id, product_id, presentation_id, type, quantity, reason, reference_type, reference_id
    ) values (
      v_opening_id, v_product.id, v_presentation.id, 'ajuste', v_initial_stock,
      'Saldo inicial al crear la presentación', 'opening_balance', v_opening_id
    );
  end if;

  return jsonb_build_object(
    'id', v_presentation.id,
    'product_id', v_presentation.product_id,
    'name', v_presentation.name,
    'weight_kg', case when v_presentation.weight_kg is null then null else round(v_presentation.weight_kg, 3)::text end,
    'cost', round(v_presentation.cost, 2)::text,
    'price', round(v_presentation.price, 2)::text,
    'price_per_kg', case when v_presentation.price_per_kg is null then null else round(v_presentation.price_per_kg, 2)::text end,
    'stock', round(v_presentation.stock, 3)::text,
    'created_at', v_presentation.created_at
  );
exception
  when numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'NUMERIC_OVERFLOW';
end;
$$;

revoke all on function public.create_product_presentation(
  uuid, text, numeric, numeric, numeric, numeric, numeric
) from public, anon;
grant execute on function public.create_product_presentation(
  uuid, text, numeric, numeric, numeric, numeric, numeric
) to authenticated;

comment on function public.create_product_presentation(
  uuid, text, numeric, numeric, numeric, numeric, numeric
) is 'Atomically creates a presentation and serializes exact decimal values as JSON strings.';
