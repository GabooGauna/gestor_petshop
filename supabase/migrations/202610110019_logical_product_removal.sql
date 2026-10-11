-- Products already have a status lifecycle. Preserve their stock and complete
-- history by archiving them instead of physically deleting catalog rows.

create or replace function public.delete_product(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'AUTHENTICATION_REQUIRED';
  end if;

  select name into v_name
  from public.products
  where id = p_product_id and status = 'active'
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'PRODUCT_NOT_FOUND';
  end if;

  -- Inventory RPCs lock presentation rows before changing stock. Waiting for
  -- the same rows makes archival a clear boundary for concurrent operations:
  -- each mutation completes before the product becomes inactive or observes it
  -- inactive afterwards.
  perform 1
  from public.product_presentations
  where product_id = p_product_id
  order by id
  for update;

  update public.products
  set status = 'inactive'
  where id = p_product_id;

  return jsonb_build_object(
    'product_id', p_product_id,
    'name', v_name,
    'deleted', false,
    'archived', true
  );
end;
$$;

revoke all on function public.delete_product(uuid) from public, anon;
grant execute on function public.delete_product(uuid) to authenticated;

comment on function public.delete_product(uuid) is
  'Archives an active product without deleting stock, movements, purchases or sales history.';

-- Archived products remain readable so historical sales, purchases and Kardex
-- keep their labels, but they cannot be edited or used by inventory mutations.
alter policy products_authenticated_update on public.products
  using ((select auth.uid()) is not null and status = 'active')
  with check ((select auth.uid()) is not null and status = 'active');

alter policy presentations_authenticated_update on public.product_presentations
  using (
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.products
      where products.id = product_presentations.product_id
        and products.status = 'active'
    )
  )
  with check (
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.products
      where products.id = product_presentations.product_id
        and products.status = 'active'
    )
  );

create or replace function public.record_shrinkage(
  p_presentation_id uuid,
  p_quantity numeric,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_id uuid := gen_random_uuid();
  v_q numeric(10,3);
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception using errcode = 'P0001', message = 'REASON_REQUIRED';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity <> round(p_quantity, 3) then
    raise exception using errcode = 'P0001', message = 'INVALID_QUANTITY';
  end if;

  v_q := p_quantity;
  select pp.*, p.type product_type, p.status product_status into v
  from public.product_presentations pp
  join public.products p on p.id = pp.product_id
  where pp.id = p_presentation_id
  for update of pp;

  if not found then
    raise exception using errcode = 'P0001', message = 'PRESENTATION_NOT_FOUND';
  end if;
  if v.product_status is distinct from 'active' then
    raise exception using errcode = 'P0001', message = 'INACTIVE_PRODUCT';
  end if;
  if v.product_type = 'unit' and v_q <> trunc(v_q) then
    raise exception using errcode = 'P0001', message = 'INVALID_QUANTITY';
  end if;
  if v.stock < v_q then
    raise exception using errcode = 'P0001', message = 'INSUFFICIENT_STOCK';
  end if;

  update public.product_presentations
  set stock = stock - v_q
  where id = p_presentation_id;

  insert into public.inventory_movements(
    id, product_id, presentation_id, type, quantity, reason, reference_type, reference_id
  ) values (
    v_id, v.product_id, p_presentation_id, 'merma', -v_q, btrim(p_reason), 'shrinkage', v_id
  );

  return jsonb_build_object(
    'movement_id', v_id,
    'product_id', v.product_id,
    'presentation_id', p_presentation_id,
    'quantity', (-v_q)::text,
    'stock_before', v.stock::text,
    'stock_after', (v.stock - v_q)::text
  );
exception
  when numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'INVALID_QUANTITY';
end;
$$;

create or replace function public.record_stock_adjustment(
  p_presentation_id uuid,
  p_physical_stock numeric,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_id uuid := gen_random_uuid();
  v_stock numeric(10,3);
  v_delta numeric(10,3);
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception using errcode = 'P0001', message = 'REASON_REQUIRED';
  end if;
  if p_physical_stock is null or p_physical_stock < 0 or p_physical_stock <> round(p_physical_stock, 3) then
    raise exception using errcode = 'P0001', message = 'INVALID_PHYSICAL_STOCK';
  end if;

  v_stock := p_physical_stock;
  select pp.*, p.type product_type, p.status product_status into v
  from public.product_presentations pp
  join public.products p on p.id = pp.product_id
  where pp.id = p_presentation_id
  for update of pp;

  if not found then
    raise exception using errcode = 'P0001', message = 'PRESENTATION_NOT_FOUND';
  end if;
  if v.product_status is distinct from 'active' then
    raise exception using errcode = 'P0001', message = 'INACTIVE_PRODUCT';
  end if;
  if v.product_type = 'unit' and v_stock <> trunc(v_stock) then
    raise exception using errcode = 'P0001', message = 'INVALID_PHYSICAL_STOCK';
  end if;

  v_delta := v_stock - v.stock;
  if v_delta = 0 then
    raise exception using errcode = 'P0001', message = 'NO_STOCK_CHANGE';
  end if;

  update public.product_presentations
  set stock = v_stock
  where id = p_presentation_id;

  insert into public.inventory_movements(
    id, product_id, presentation_id, type, quantity, reason, reference_type, reference_id
  ) values (
    v_id, v.product_id, p_presentation_id, 'ajuste', v_delta, btrim(p_reason), 'adjustment', v_id
  );

  return jsonb_build_object(
    'movement_id', v_id,
    'product_id', v.product_id,
    'presentation_id', p_presentation_id,
    'quantity', v_delta::text,
    'stock_before', v.stock::text,
    'stock_after', v_stock::text
  );
exception
  when numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'INVALID_PHYSICAL_STOCK';
end;
$$;

revoke all on function public.record_shrinkage(uuid, numeric, text) from public, anon;
revoke all on function public.record_stock_adjustment(uuid, numeric, text) from public, anon;
grant execute on function public.record_shrinkage(uuid, numeric, text) to authenticated;
grant execute on function public.record_stock_adjustment(uuid, numeric, text) to authenticated;

comment on function public.record_shrinkage(uuid, numeric, text) is
  'Atomically records shrinkage for an active product presentation.';
comment on function public.record_stock_adjustment(uuid, numeric, text) is
  'Atomically records a physical-stock adjustment for an active product presentation.';
