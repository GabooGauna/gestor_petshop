begin;

create or replace function public.delete_product(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  select name into v_name
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'PRODUCT_NOT_FOUND';
  end if;

  if exists (
    select 1 from public.product_presentations
    where product_id = p_product_id and stock <> 0
  ) then
    raise exception using errcode = 'P0001', message = 'PRODUCT_HAS_STOCK';
  end if;

  if exists (select 1 from public.sale_items where product_id = p_product_id)
    or exists (select 1 from public.purchase_items where product_id = p_product_id)
    or exists (select 1 from public.inventory_movements where product_id = p_product_id)
  then
    raise exception using errcode = 'P0001', message = 'PRODUCT_HAS_HISTORY';
  end if;

  delete from public.products where id = p_product_id;
  return jsonb_build_object('product_id', p_product_id, 'name', v_name, 'deleted', true);
end;
$$;

create or replace function public.delete_presentation(p_presentation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_stock numeric;
begin
  select name, stock into v_name, v_stock
  from public.product_presentations
  where id = p_presentation_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'PRESENTATION_NOT_FOUND';
  end if;

  if v_stock <> 0 then
    raise exception using errcode = 'P0001', message = 'PRESENTATION_HAS_STOCK';
  end if;

  if exists (select 1 from public.sale_items where presentation_id = p_presentation_id)
    or exists (select 1 from public.purchase_items where presentation_id = p_presentation_id)
    or exists (select 1 from public.inventory_movements where presentation_id = p_presentation_id)
  then
    raise exception using errcode = 'P0001', message = 'PRESENTATION_HAS_HISTORY';
  end if;

  delete from public.product_presentations where id = p_presentation_id;
  return jsonb_build_object('presentation_id', p_presentation_id, 'name', v_name, 'deleted', true);
end;
$$;

revoke all on function public.delete_product(uuid) from public, anon;
revoke all on function public.delete_presentation(uuid) from public, anon;
grant execute on function public.delete_product(uuid) to authenticated;
grant execute on function public.delete_presentation(uuid) to authenticated;

commit;
