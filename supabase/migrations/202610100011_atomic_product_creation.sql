-- Create the initial product, presentation and opening balance as one transaction.

create or replace function public.create_product_with_presentation(
  p_name text,
  p_brand text,
  p_category_id uuid,
  p_type text,
  p_min_stock numeric,
  p_presentation_name text,
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
  v_presentation_id uuid;
  v_opening_id uuid;
  v_min_stock numeric(10,3);
  v_initial_stock numeric(10,3);
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception using errcode = 'P0001', message = 'PRODUCT_NAME_REQUIRED';
  end if;
  if p_type not in ('unit', 'weight') then
    raise exception using errcode = 'P0001', message = 'PETSTOCK_PRODUCT_TYPE_INVALID';
  end if;
  if p_category_id is not null and not exists (
    select 1 from public.categories where id = p_category_id
  ) then
    raise exception using errcode = 'P0001', message = 'CATEGORY_NOT_FOUND';
  end if;
  if nullif(btrim(p_presentation_name), '') is null then
    raise exception using errcode = 'P0001', message = 'PRESENTATION_NAME_REQUIRED';
  end if;
  if p_min_stock is null or p_min_stock < 0 or p_min_stock <> round(p_min_stock, 3) then
    raise exception using errcode = 'P0001', message = 'INVALID_MIN_STOCK';
  end if;
  if p_initial_stock is null or p_initial_stock < 0 or p_initial_stock <> round(p_initial_stock, 3) then
    raise exception using errcode = 'P0001', message = 'INVALID_INITIAL_STOCK';
  end if;
  if p_cost is null or p_cost < 0 or p_cost <> round(p_cost, 2)
    or p_price is null or p_price < 0 or p_price <> round(p_price, 2)
    or (p_price_per_kg is not null and (p_price_per_kg < 0 or p_price_per_kg <> round(p_price_per_kg, 2))) then
    raise exception using errcode = 'P0001', message = 'INVALID_PRICE';
  end if;
  if p_type = 'weight' and (p_weight_kg is null or p_weight_kg <= 0 or p_weight_kg <> round(p_weight_kg, 3)) then
    raise exception using errcode = 'P0001', message = 'PETSTOCK_WEIGHT_REQUIRED';
  end if;
  if p_type = 'unit' and (p_weight_kg is not null or p_price_per_kg is not null) then
    raise exception using errcode = 'P0001', message = 'PETSTOCK_UNIT_PRESENTATION_HAS_WEIGHT_FIELDS';
  end if;
  if p_type = 'unit' and (p_min_stock <> trunc(p_min_stock) or p_initial_stock <> trunc(p_initial_stock)) then
    raise exception using errcode = 'P0001', message = 'INVALID_UNIT_STOCK';
  end if;

  v_min_stock := p_min_stock;
  v_initial_stock := p_initial_stock;

  insert into public.products(name, brand, category_id, type, min_stock, status)
  values (btrim(p_name), nullif(btrim(p_brand), ''), p_category_id, p_type, v_min_stock, 'active')
  returning * into v_product;

  insert into public.product_presentations(
    product_id, name, weight_kg, cost, price, price_per_kg, stock
  ) values (
    v_product.id, btrim(p_presentation_name), p_weight_kg,
    p_cost, p_price, p_price_per_kg, v_initial_stock
  ) returning id into v_presentation_id;

  if v_initial_stock > 0 then
    v_opening_id := gen_random_uuid();
    insert into public.inventory_movements(
      id, product_id, presentation_id, type, quantity, reason, reference_type, reference_id
    ) values (
      v_opening_id, v_product.id, v_presentation_id, 'ajuste', v_initial_stock,
      'Saldo inicial al crear la presentación', 'opening_balance', v_opening_id
    );
  end if;

  return jsonb_build_object(
    'id', v_product.id,
    'name', v_product.name,
    'brand', v_product.brand,
    'category_id', v_product.category_id,
    'type', v_product.type,
    'min_stock', round(v_product.min_stock, 3)::text,
    'status', v_product.status,
    'created_at', v_product.created_at,
    'presentation_id', v_presentation_id
  );
exception
  when numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'NUMERIC_OVERFLOW';
end;
$$;

revoke all on function public.create_product_with_presentation(
  text, text, uuid, text, numeric, text, numeric, numeric, numeric, numeric, numeric
) from public, anon;
grant execute on function public.create_product_with_presentation(
  text, text, uuid, text, numeric, text, numeric, numeric, numeric, numeric, numeric
) to authenticated;

revoke insert on public.products from authenticated;

comment on function public.create_product_with_presentation(
  text, text, uuid, text, numeric, text, numeric, numeric, numeric, numeric, numeric
) is 'Atomically creates a product, its first presentation and its optional opening inventory movement.';
