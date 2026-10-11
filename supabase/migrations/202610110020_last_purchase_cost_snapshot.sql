-- Enforce last-purchase replacement cost and preserve its sale-time operands.
-- This migration is intentionally local until explicitly authorized for remote use.

alter table public.sale_items
  add column if not exists replacement_cost_snapshot numeric(12,2),
  add column if not exists presentation_weight_snapshot numeric(10,3),
  add column if not exists cost_basis text;

alter table public.sale_items
  add constraint sale_items_replacement_cost_snapshot_check
    check (replacement_cost_snapshot is null or replacement_cost_snapshot >= 0) not valid,
  add constraint sale_items_presentation_weight_snapshot_check
    check (presentation_weight_snapshot is null or presentation_weight_snapshot > 0) not valid,
  add constraint sale_items_cost_basis_check
    check (cost_basis is null or cost_basis in ('opening_cost', 'last_purchase')) not valid;

alter table public.sale_items
  validate constraint sale_items_replacement_cost_snapshot_check;
alter table public.sale_items
  validate constraint sale_items_presentation_weight_snapshot_check;
alter table public.sale_items
  validate constraint sale_items_cost_basis_check;

comment on column public.product_presentations.cost is
  'Replacement cost for one commercial package/unit: opening cost until the first purchase, then the latest confirmed purchase cost. Not catalog-editable.';
comment on column public.sale_items.cost is
  'Definitive historical line cost, rounded once to NUMERIC(12,2) when the sale is confirmed.';
comment on column public.sale_items.replacement_cost_snapshot is
  'Presentation/unit replacement cost used by the sale. Null only for legacy rows created before the snapshot contract.';
comment on column public.sale_items.presentation_weight_snapshot is
  'Presentation weight used to derive fractional cost. Null for unit sales and legacy rows.';
comment on column public.sale_items.cost_basis is
  'Cost source used by the sale: opening_cost before any purchase, last_purchase afterwards, null for legacy rows.';

create or replace function public.capture_sale_item_cost_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_presentation record;
  v_expected_cost numeric(12,2);
begin
  select pp.*, p.type as product_type
    into v_presentation
  from public.product_presentations pp
  join public.products p on p.id = pp.product_id
  where pp.id = new.presentation_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'PRESENTATION_NOT_FOUND';
  end if;

  if new.product_id is distinct from v_presentation.product_id then
    raise exception using errcode = 'P0001', message = 'SALE_PRODUCT_MISMATCH';
  end if;

  if new.sale_mode in ('amount', 'weight') then
    if v_presentation.product_type <> 'weight'
       or v_presentation.weight_kg is null
       or v_presentation.weight_kg <= 0 then
      raise exception using errcode = 'P0001', message = 'MODE_PRODUCT_MISMATCH';
    end if;
    if new.commercial_quantity is distinct from new.quantity then
      raise exception using errcode = 'P0001', message = 'SALE_QUANTITY_MISMATCH';
    end if;
    v_expected_cost := round(
      (v_presentation.cost / v_presentation.weight_kg) * new.quantity,
      2
    );
    new.presentation_weight_snapshot := v_presentation.weight_kg;
  elsif new.sale_mode = 'package' then
    if v_presentation.product_type <> 'weight'
       or v_presentation.weight_kg is null
       or v_presentation.weight_kg <= 0 then
      raise exception using errcode = 'P0001', message = 'MODE_PRODUCT_MISMATCH';
    end if;
    if new.commercial_quantity is null or new.commercial_quantity <= 0
       or new.commercial_quantity <> trunc(new.commercial_quantity) then
      raise exception using errcode = 'P0001', message = 'INVALID_QUANTITY';
    end if;
    if new.quantity is distinct from round(new.commercial_quantity * v_presentation.weight_kg, 3) then
      raise exception using errcode = 'P0001', message = 'SALE_QUANTITY_MISMATCH';
    end if;
    v_expected_cost := round(new.commercial_quantity * v_presentation.cost, 2);
    new.presentation_weight_snapshot := v_presentation.weight_kg;
  elsif new.sale_mode = 'unit' then
    if v_presentation.product_type <> 'unit' then
      raise exception using errcode = 'P0001', message = 'MODE_PRODUCT_MISMATCH';
    end if;
    if new.commercial_quantity is null or new.commercial_quantity <= 0
       or new.commercial_quantity <> trunc(new.commercial_quantity) then
      raise exception using errcode = 'P0001', message = 'INVALID_QUANTITY';
    end if;
    if new.quantity is distinct from new.commercial_quantity then
      raise exception using errcode = 'P0001', message = 'SALE_QUANTITY_MISMATCH';
    end if;
    v_expected_cost := round(new.commercial_quantity * v_presentation.cost, 2);
    new.presentation_weight_snapshot := null;
  else
    raise exception using errcode = 'P0001', message = 'MODE_PRODUCT_MISMATCH';
  end if;

  if new.cost is distinct from v_expected_cost then
    raise exception using errcode = 'P0001', message = 'SALE_COST_MISMATCH';
  end if;

  new.replacement_cost_snapshot := v_presentation.cost;
  new.cost_basis := case
    when exists (
      select 1
      from public.purchase_items pi
      where pi.presentation_id = new.presentation_id
    ) then 'last_purchase'
    else 'opening_cost'
  end;
  return new;
end;
$$;

drop trigger if exists sale_items_capture_cost_snapshot on public.sale_items;
create trigger sale_items_capture_cost_snapshot
before insert on public.sale_items
for each row execute function public.capture_sale_item_cost_snapshot();

revoke execute on function public.capture_sale_item_cost_snapshot()
  from public, anon, authenticated;

-- Sale economics are append-only evidence. RLS already makes sale_items read-only
-- to authenticated clients; this trigger also prevents privileged application code
-- from silently rewriting the operands or result of a confirmed sale.
create or replace function public.protect_sale_item_cost_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sale_id is distinct from old.sale_id
     or new.product_id is distinct from old.product_id
     or new.presentation_id is distinct from old.presentation_id
     or new.quantity is distinct from old.quantity
     or new.unit_price is distinct from old.unit_price
     or new.subtotal is distinct from old.subtotal
     or new.cost is distinct from old.cost
     or new.sale_mode is distinct from old.sale_mode
     or new.commercial_quantity is distinct from old.commercial_quantity
     or new.replacement_cost_snapshot is distinct from old.replacement_cost_snapshot
     or new.presentation_weight_snapshot is distinct from old.presentation_weight_snapshot
     or new.cost_basis is distinct from old.cost_basis then
    raise exception using errcode = 'P0001', message = 'SALE_ITEM_SNAPSHOT_IMMUTABLE';
  end if;

  return new;
end;
$$;

drop trigger if exists sale_items_protect_cost_snapshot on public.sale_items;
create trigger sale_items_protect_cost_snapshot
before update of
  sale_id, product_id, presentation_id, quantity, unit_price, subtotal, cost,
  sale_mode, commercial_quantity, replacement_cost_snapshot,
  presentation_weight_snapshot, cost_basis
on public.sale_items
for each row execute function public.protect_sale_item_cost_snapshot();

revoke execute on function public.protect_sale_item_cost_snapshot()
  from public, anon, authenticated;

-- Return the persisted cost evidence to the caller. The presentation rows are
-- locked before they are read, so a concurrent purchase either happens wholly
-- before this sale (and supplies its cost) or wholly after it.
create or replace function public.process_sale(p_payment_method text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale uuid; v_item_id uuid; v_item jsonb; v_ids uuid[]; v_pid uuid; v_mode text;
  v_input numeric; v_stock numeric(10,3); v_commercial numeric(10,3);
  v_price numeric(12,2); v_subtotal numeric(12,2); v_cost numeric(12,2);
  v_replacement_cost numeric(12,2); v_weight_snapshot numeric(10,3); v_cost_basis text;
  v_total numeric(12,2) := 0; v_total_cost numeric(12,2) := 0; v_row record;
  v_results jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if coalesce(p_payment_method, '') not in ('efectivo','transferencia','debito','credito','mercado_pago','otro') then
    raise exception using errcode = 'P0001', message = 'INVALID_PAYMENT_METHOD';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception using errcode = 'P0001', message = 'INVALID_ITEMS';
  end if;

  select array_agg((x->>'presentation_id')::uuid order by (x->>'presentation_id')::uuid)
  into v_ids
  from jsonb_array_elements(p_items) x
  where jsonb_typeof(x) = 'object'
    and (x->>'presentation_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  if coalesce(cardinality(v_ids), 0) <> jsonb_array_length(p_items) then
    raise exception using errcode = 'P0001', message = 'INVALID_ITEMS';
  end if;
  if cardinality(v_ids) <> (select count(distinct x) from unnest(v_ids) x) then
    raise exception using errcode = 'P0001', message = 'DUPLICATE_PRESENTATION';
  end if;

  perform id from public.product_presentations where id = any(v_ids) order by id for update;
  if (select count(*) from public.product_presentations where id = any(v_ids)) <> cardinality(v_ids) then
    raise exception using errcode = 'P0001', message = 'PRESENTATION_NOT_FOUND';
  end if;

  insert into public.sales(total_amount, total_cost, payment_method)
  values (0, 0, p_payment_method)
  returning id into v_sale;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_pid := (v_item->>'presentation_id')::uuid;
    v_mode := v_item->>'mode';
    if coalesce(v_mode, '') not in ('amount','weight','package','unit') then
      raise exception using errcode = 'P0001', message = 'MODE_PRODUCT_MISMATCH';
    end if;
    if v_mode = 'amount' then
      if coalesce(v_item->>'amount', '') !~ '^[0-9]+[.][0-9]{2}$' then
        raise exception using errcode = 'P0001', message = 'INVALID_AMOUNT';
      end if;
      v_input := (v_item->>'amount')::numeric;
    else
      if coalesce(v_item->>'quantity', '') !~ '^[0-9]+([.][0-9]{1,3})?$' then
        raise exception using errcode = 'P0001', message = 'INVALID_QUANTITY';
      end if;
      v_input := (v_item->>'quantity')::numeric;
    end if;
    if v_input <= 0 then
      raise exception using errcode = 'P0001',
        message = case when v_mode = 'amount' then 'INVALID_AMOUNT' else 'INVALID_QUANTITY' end;
    end if;

    select pp.*, p.type product_type, p.status product_status into strict v_row
    from public.product_presentations pp
    join public.products p on p.id = pp.product_id
    where pp.id = v_pid;
    if v_row.product_status is distinct from 'active' then
      raise exception using errcode = 'P0001', message = 'INACTIVE_PRODUCT';
    end if;

    if v_mode in ('amount', 'weight') then
      if v_row.product_type <> 'weight' or v_row.weight_kg is null or v_row.weight_kg <= 0 then
        raise exception using errcode = 'P0001', message = 'MODE_PRODUCT_MISMATCH';
      end if;
      if coalesce(v_row.price_per_kg, 0) <= 0 then
        raise exception using errcode = 'P0001', message = 'PRICE_NOT_CONFIGURED';
      end if;
      v_price := v_row.price_per_kg;
      if v_mode = 'amount' then
        v_subtotal := v_input::numeric(12,2);
        v_stock := round(v_input / v_price, 3);
        v_commercial := v_stock;
      else
        v_stock := v_input::numeric(10,3);
        v_commercial := v_stock;
        v_subtotal := round(v_stock * v_price, 2);
      end if;
      v_cost := round((v_row.cost / v_row.weight_kg) * v_stock, 2);
    elsif v_mode = 'package' then
      if v_row.product_type <> 'weight' or v_row.weight_kg is null or v_row.weight_kg <= 0 then
        raise exception using errcode = 'P0001', message = 'MODE_PRODUCT_MISMATCH';
      end if;
      if v_input <> trunc(v_input) then
        raise exception using errcode = 'P0001', message = 'INVALID_QUANTITY';
      end if;
      if v_row.price <= 0 then
        raise exception using errcode = 'P0001', message = 'PRICE_NOT_CONFIGURED';
      end if;
      v_commercial := v_input;
      v_stock := round(v_input * v_row.weight_kg, 3);
      v_price := v_row.price;
      v_subtotal := round(v_input * v_price, 2);
      v_cost := round(v_input * v_row.cost, 2);
    else
      if v_row.product_type <> 'unit' then
        raise exception using errcode = 'P0001', message = 'MODE_PRODUCT_MISMATCH';
      end if;
      if v_input <> trunc(v_input) then
        raise exception using errcode = 'P0001', message = 'INVALID_QUANTITY';
      end if;
      if v_row.price <= 0 then
        raise exception using errcode = 'P0001', message = 'PRICE_NOT_CONFIGURED';
      end if;
      v_commercial := v_input;
      v_stock := v_input;
      v_price := v_row.price;
      v_subtotal := round(v_input * v_price, 2);
      v_cost := round(v_input * v_row.cost, 2);
    end if;

    if v_stock <= 0 then
      raise exception using errcode = 'P0001', message = 'INVALID_QUANTITY';
    end if;
    if v_row.stock < v_stock then
      raise exception using errcode = 'P0001', message = 'INSUFFICIENT_STOCK';
    end if;

    update public.product_presentations set stock = stock - v_stock where id = v_pid;
    insert into public.sale_items(
      sale_id, product_id, presentation_id, quantity, unit_price, subtotal, cost,
      sale_mode, commercial_quantity
    ) values (
      v_sale, v_row.product_id, v_pid, v_stock, v_price, v_subtotal, v_cost,
      v_mode, v_commercial
    )
    returning id, replacement_cost_snapshot, presentation_weight_snapshot, cost_basis
    into v_item_id, v_replacement_cost, v_weight_snapshot, v_cost_basis;

    insert into public.inventory_movements(
      product_id, presentation_id, type, quantity, reason, reference_type, reference_id
    ) values (
      v_row.product_id, v_pid, 'venta', -v_stock, 'Venta ' || v_sale, 'sale', v_sale
    );

    v_total := v_total + v_subtotal;
    v_total_cost := v_total_cost + v_cost;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'sale_item_id', v_item_id,
      'product_id', v_row.product_id,
      'presentation_id', v_pid,
      'mode', v_mode,
      'commercial_quantity', v_commercial::text,
      'stock_quantity', v_stock::text,
      'unit_price', v_price::text,
      'subtotal', v_subtotal::text,
      'line_cost', v_cost::text,
      'replacement_cost_snapshot', v_replacement_cost::text,
      'presentation_weight_snapshot', case when v_weight_snapshot is null then null else v_weight_snapshot::text end,
      'cost_basis', v_cost_basis,
      'stock_after', (v_row.stock - v_stock)::text
    ));
  end loop;

  update public.sales set total_amount = v_total, total_cost = v_total_cost where id = v_sale;
  return jsonb_build_object(
    'sale_id', v_sale,
    'total_amount', v_total::text,
    'total_cost', v_total_cost::text,
    'items', v_results
  );
exception
  when numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'NUMERIC_OVERFLOW';
end;
$$;

revoke all on function public.process_sale(text, jsonb) from public, anon;
grant execute on function public.process_sale(text, jsonb) to authenticated;

-- Purchases remain the only post-creation path that changes replacement cost.
-- Existing SECURITY DEFINER purchase RPCs continue to update this column.
revoke update(cost) on public.product_presentations from authenticated;

