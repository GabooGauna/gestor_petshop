-- Corrective migration for environments where the historical 018 and 019
-- were applied before their final concurrency hardening. This is deliberately a
-- new version: never repair or overwrite the existing remote migration history.
-- Apply after 020 with application writes paused, then run postconditions 020/021.

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

  -- Serialize presentation creation with product archival independently of
  -- MVCC visibility. Namespace 1347638356 is reserved by PetStock tests/runtime
  -- for this per-product transaction boundary.
  perform pg_advisory_xact_lock(1347638356, hashtext(p_product_id::text));

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

  -- Advisory -> sorted presentations -> product is the archival order. The
  -- per-product advisory lock also serializes an invisible concurrent INSERT
  -- from create_product_presentation, closing the MVCC phantom boundary.
  perform pg_advisory_xact_lock(1347638356, hashtext(p_product_id::text));

  perform 1
  from public.product_presentations
  where product_id = p_product_id
  order by id
  for update;

  select name into v_name
  from public.products
  where id = p_product_id and status = 'active'
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'PRODUCT_NOT_FOUND';
  end if;

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

-- A presentation identity is immutable. In particular, authenticated catalog
-- edits must not reparent a row away from a product that was concurrently or
-- previously archived.
revoke update(product_id) on public.product_presentations from authenticated;

-- RLS can qualify an UPDATE while the product is active and then wait on a
-- presentation row held by delete_product. A BEFORE UPDATE trigger runs only
-- after that row lock is acquired, so it can safely re-read the product and
-- reject a write that crossed the archival boundary.
create or replace function public.ensure_presentation_product_active_on_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select p.status into v_status
  from public.products p
  where p.id = new.product_id
  for key share;

  if not found then
    raise exception using errcode = 'P0001', message = 'PRESENTATION_NOT_FOUND';
  end if;
  if v_status is distinct from 'active' then
    raise exception using errcode = 'P0001', message = 'INACTIVE_PRODUCT';
  end if;

  return new;
end;
$$;

drop trigger if exists presentations_require_active_product_on_update
  on public.product_presentations;
create trigger presentations_require_active_product_on_update
before update on public.product_presentations
for each row execute function public.ensure_presentation_product_active_on_update();

revoke execute on function public.ensure_presentation_product_active_on_update()
  from public, anon, authenticated;

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
  v_product record;
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
  select pp.* into v
  from public.product_presentations pp
  where pp.id = p_presentation_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'PRESENTATION_NOT_FOUND';
  end if;

  -- Product status is deliberately read in a second statement after the
  -- presentation lock. If archival held that row, READ COMMITTED now sees the
  -- committed inactive state instead of a stale joined snapshot.
  select p.type, p.status into v_product
  from public.products p
  where p.id = v.product_id
  for key share;

  if not found then
    raise exception using errcode = 'P0001', message = 'PRESENTATION_NOT_FOUND';
  end if;
  if v_product.status is distinct from 'active' then
    raise exception using errcode = 'P0001', message = 'INACTIVE_PRODUCT';
  end if;
  if v_product.type = 'unit' and v_q <> trunc(v_q) then
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
  v_product record;
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
  select pp.* into v
  from public.product_presentations pp
  where pp.id = p_presentation_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'PRESENTATION_NOT_FOUND';
  end if;

  -- Re-read the product only after the presentation lock is owned. This uses
  -- the global presentations -> product order and avoids stale status.
  select p.type, p.status into v_product
  from public.products p
  where p.id = v.product_id
  for key share;

  if not found then
    raise exception using errcode = 'P0001', message = 'PRESENTATION_NOT_FOUND';
  end if;
  if v_product.status is distinct from 'active' then
    raise exception using errcode = 'P0001', message = 'INACTIVE_PRODUCT';
  end if;
  if v_product.type = 'unit' and v_stock <> trunc(v_stock) then
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

create or replace function public.delete_presentation(p_presentation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_presentation public.product_presentations%rowtype;
  v_product_status text;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'AUTHENTICATION_REQUIRED';
  end if;

  select pp.* into v_presentation
  from public.product_presentations pp
  where pp.id = p_presentation_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'PRESENTATION_NOT_FOUND';
  end if;

  select p.status into v_product_status
  from public.products p
  where p.id = v_presentation.product_id
  for key share;

  if not found then
    raise exception using errcode = 'P0001', message = 'PRESENTATION_NOT_FOUND';
  end if;
  if v_product_status is distinct from 'active' then
    raise exception using errcode = 'P0001', message = 'INACTIVE_PRODUCT';
  end if;

  if exists (select 1 from public.sale_items where presentation_id = p_presentation_id)
    or exists (select 1 from public.purchase_items where presentation_id = p_presentation_id)
  then
    raise exception using errcode = 'P0001', message = 'PRESENTATION_HAS_TRANSACTIONS';
  end if;

  delete from public.product_presentations where id = p_presentation_id;
  return jsonb_build_object(
    'presentation_id', p_presentation_id,
    'name', v_presentation.name,
    'deleted', true
  );
end;
$$;

revoke all on function public.delete_presentation(uuid) from public, anon;
grant execute on function public.delete_presentation(uuid) to authenticated;

comment on function public.delete_presentation(uuid) is
  'Deletes an unused presentation only while its product remains active.';

