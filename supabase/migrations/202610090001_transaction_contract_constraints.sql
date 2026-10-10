-- PetStock transaction contract: additive columns and invariants.
-- Existing rows are preserved. NOT VALID checks still protect every new write.

alter table public.sale_items
  add column if not exists sale_mode text,
  add column if not exists commercial_quantity numeric(10,3);

alter table public.inventory_movements
  add column if not exists reference_type text,
  add column if not exists reference_id uuid;

alter table public.sale_items
  add constraint sale_items_sale_mode_check
    check (sale_mode is null or sale_mode in ('amount', 'weight', 'package', 'unit')) not valid,
  add constraint sale_items_commercial_quantity_positive_check
    check (commercial_quantity is null or commercial_quantity > 0) not valid,
  add constraint sale_items_quantity_positive_check
    check (quantity > 0) not valid,
  add constraint sale_items_money_nonnegative_check
    check (unit_price >= 0 and subtotal >= 0 and cost >= 0) not valid;

alter table public.purchase_items
  add constraint purchase_items_values_check
    check (quantity > 0 and quantity = trunc(quantity) and unit_cost >= 0 and subtotal >= 0) not valid;

alter table public.sales
  add constraint sales_totals_nonnegative_check
    check (total_amount >= 0 and total_cost >= 0) not valid;

alter table public.purchases
  add constraint purchases_total_nonnegative_check
    check (total_amount >= 0) not valid;

alter table public.product_presentations
  add constraint product_presentations_values_check
    check (
      stock >= 0 and cost >= 0 and price >= 0
      and (weight_kg is null or weight_kg > 0)
      and (price_per_kg is null or price_per_kg >= 0)
    ) not valid;

alter table public.inventory_movements
  add constraint inventory_movements_quantity_nonzero_check
    check (quantity <> 0) not valid,
  add constraint inventory_movements_sign_check
    check (
      (type = 'compra' and quantity > 0)
      or (type in ('venta','merma') and quantity < 0)
      or (type = 'ajuste' and quantity <> 0)
    ) not valid,
  add constraint inventory_movements_reference_check
    check (
      (reference_type is null and reference_id is null)
      or (reference_type in ('sale', 'purchase', 'shrinkage', 'adjustment', 'opening_balance') and reference_id is not null)
    ) not valid,
  add constraint inventory_movements_shrinkage_reason_check
    check (type not in ('merma','ajuste') or nullif(btrim(reason), '') is not null) not valid;

create unique index if not exists inventory_movements_reference_presentation_uidx
  on public.inventory_movements(reference_type,reference_id,presentation_id)
  where reference_type is not null and reference_id is not null;

create or replace function public.validate_presentation_unit_contract()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_product_type text;
begin
  select p.type into v_product_type
  from public.products p
  where p.id = new.product_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'PETSTOCK_PRESENTATION_PRODUCT_NOT_FOUND';
  end if;

  if v_product_type = 'weight' then
    if new.weight_kg is null or new.weight_kg <= 0 then
      raise exception using errcode = 'P0001', message = 'PETSTOCK_WEIGHT_REQUIRED';
    end if;
  elsif v_product_type = 'unit' then
    if new.weight_kg is not null or new.price_per_kg is not null then
      raise exception using errcode = 'P0001', message = 'PETSTOCK_UNIT_PRESENTATION_HAS_WEIGHT_FIELDS';
    end if;
  else
    raise exception using errcode = 'P0001', message = 'PETSTOCK_PRODUCT_TYPE_INVALID';
  end if;

  return new;
end;
$$;

drop trigger if exists product_presentations_unit_contract on public.product_presentations;
create trigger product_presentations_unit_contract
before insert or update of product_id, weight_kg, price_per_kg
on public.product_presentations
for each row execute function public.validate_presentation_unit_contract();

create or replace function public.validate_product_type_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type = 'weight' then
    if exists (
      select 1 from public.product_presentations pp
      where pp.product_id = new.id
        and (pp.weight_kg is null or pp.weight_kg <= 0)
    ) then
      raise exception using errcode = 'P0001', message = 'PETSTOCK_WEIGHT_PRESENTATIONS_INCOMPATIBLE';
    end if;
  elsif new.type = 'unit' then
    if exists (
      select 1 from public.product_presentations pp
      where pp.product_id = new.id
        and (pp.weight_kg is not null or pp.price_per_kg is not null)
    ) then
      raise exception using errcode = 'P0001', message = 'PETSTOCK_UNIT_PRESENTATIONS_INCOMPATIBLE';
    end if;
  else
    raise exception using errcode = 'P0001', message = 'PETSTOCK_PRODUCT_TYPE_INVALID';
  end if;

  return new;
end;
$$;

drop trigger if exists products_type_contract on public.products;
create trigger products_type_contract
before update of type on public.products
for each row execute function public.validate_product_type_change();

comment on column public.product_presentations.stock is
  'Base stock unit: kilograms for weight products; units for unit products.';
comment on column public.product_presentations.cost is
  'Latest acquisition cost for one commercial package/unit; server converts it to base-unit cost on sale.';
comment on column public.sale_items.quantity is
  'Base stock quantity removed (kg or units).';
comment on column public.sale_items.commercial_quantity is
  'Commercial quantity: calculated kg for amount, entered kg for weight, or package/unit count.';
comment on column public.sale_items.cost is
  'Historical total cost of this sale line.';

revoke execute on function public.validate_presentation_unit_contract() from public, anon, authenticated;
revoke execute on function public.validate_product_type_change() from public, anon, authenticated;
