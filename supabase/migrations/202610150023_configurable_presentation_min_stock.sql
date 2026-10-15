-- Configurable low-stock threshold per presentation.
-- Requires the logical lifecycle contract from migration 022.
-- This file is intentionally local until explicit authorization for remote use.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'product_presentations'
      and column_name = 'status'
  ) then
    raise exception using errcode = 'P0001', message = 'PETSTOCK_022_REQUIRED';
  end if;

  if not exists (
      select 1 from pg_trigger
      where tgrelid = 'public.product_presentations'::regclass
        and tgname = 'presentations_require_active_product_on_update'
        and not tgisinternal and tgenabled = 'O'
    )
    or not exists (
      select 1 from pg_trigger
      where tgrelid = 'public.product_presentations'::regclass
        and tgname = 'presentations_enforce_lifecycle_on_update'
        and not tgisinternal and tgenabled = 'O'
    )
  then
    raise exception using errcode = 'P0001', message = 'PETSTOCK_PRESENTATION_GUARDS_REQUIRED';
  end if;

  if exists (
    select 1
    from public.products p
    where p.type = 'unit'
      and coalesce(p.min_stock, 0::numeric) <> trunc(coalesce(p.min_stock, 0::numeric))
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_UNIT_MIN_STOCK_BACKFILL';
  end if;
end $$;

alter table public.product_presentations
  add column min_stock numeric(10,3) not null default 0;

-- Preserve the explicit value configured before thresholds became per-presentation.
-- Deliberately do not reproduce the former preventive floor of five.
-- The existing update guards intentionally reject writes to presentations whose
-- product or presentation is archived. Disable only those two guards inside this
-- migration transaction so the one-time backfill also covers historical rows;
-- any failure rolls the trigger state and data back atomically.
alter table public.product_presentations
  disable trigger presentations_require_active_product_on_update;
alter table public.product_presentations
  disable trigger presentations_enforce_lifecycle_on_update;

update public.product_presentations pp
set min_stock = coalesce(p.min_stock, 0::numeric)
from public.products p
where p.id = pp.product_id;

alter table public.product_presentations
  enable trigger presentations_require_active_product_on_update;
alter table public.product_presentations
  enable trigger presentations_enforce_lifecycle_on_update;

alter table public.product_presentations
  add constraint product_presentations_min_stock_nonnegative
    check (min_stock >= 0);

comment on column public.product_presentations.min_stock is
  'User-configured low-stock threshold in the presentation operational unit. Zero alerts only when stock is zero.';

create or replace function public.validate_presentation_min_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_type text;
begin
  if new.min_stock is null or new.min_stock < 0 then
    raise exception using errcode = 'P0001', message = 'INVALID_MIN_STOCK';
  end if;

  select p.type into v_product_type
  from public.products p
  where p.id = new.product_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'PRODUCT_NOT_FOUND';
  end if;
  if v_product_type = 'unit' and new.min_stock <> trunc(new.min_stock) then
    raise exception using errcode = 'P0001', message = 'INVALID_UNIT_MIN_STOCK';
  end if;

  return new;
end;
$$;

drop trigger if exists presentations_validate_min_stock
  on public.product_presentations;
create trigger presentations_validate_min_stock
before insert or update of min_stock, product_id on public.product_presentations
for each row execute function public.validate_presentation_min_stock();

revoke execute on function public.validate_presentation_min_stock()
  from public, anon, authenticated;

-- Direct catalog edits remain restricted to active presentations. Stock and cost
-- continue to be transactional and lifecycle status continues to be RPC-only.
revoke update on public.product_presentations from authenticated;
grant update (
  name, weight_kg, price, price_per_kg, min_stock
) on public.product_presentations to authenticated;

-- Lifecycle transitions must remain pure after adding the threshold column.
create or replace function public.enforce_presentation_lifecycle_on_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'inactive' then
    if new.status = 'active'
       and new.id is not distinct from old.id
       and new.product_id is not distinct from old.product_id
       and new.name is not distinct from old.name
       and new.weight_kg is not distinct from old.weight_kg
       and new.cost is not distinct from old.cost
       and new.price is not distinct from old.price
       and new.price_per_kg is not distinct from old.price_per_kg
       and new.stock is not distinct from old.stock
       and new.min_stock is not distinct from old.min_stock
       and new.created_at is not distinct from old.created_at then
      return new;
    end if;
    raise exception using errcode = 'P0001', message = 'INACTIVE_PRESENTATION';
  end if;

  if new.status = 'inactive' and (
       new.id is distinct from old.id
       or new.product_id is distinct from old.product_id
       or new.name is distinct from old.name
       or new.weight_kg is distinct from old.weight_kg
       or new.cost is distinct from old.cost
       or new.price is distinct from old.price
       or new.price_per_kg is distinct from old.price_per_kg
       or new.stock is distinct from old.stock
       or new.min_stock is distinct from old.min_stock
       or new.created_at is distinct from old.created_at
     ) then
    raise exception using errcode = 'P0001', message = 'INVALID_PRESENTATION_STATUS_TRANSITION';
  end if;

  return new;
end;
$$;

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
  if p_type = 'unit' and p_min_stock <> trunc(p_min_stock) then
    raise exception using errcode = 'P0001', message = 'INVALID_UNIT_MIN_STOCK';
  end if;
  if p_type = 'unit' and p_initial_stock <> trunc(p_initial_stock) then
    raise exception using errcode = 'P0001', message = 'INVALID_UNIT_STOCK';
  end if;

  v_min_stock := p_min_stock;
  v_initial_stock := p_initial_stock;

  insert into public.products(name, brand, category_id, type, min_stock, status)
  values (btrim(p_name), nullif(btrim(p_brand), ''), p_category_id, p_type, v_min_stock, 'active')
  returning * into v_product;

  insert into public.product_presentations(
    product_id, name, weight_kg, cost, price, price_per_kg, stock, min_stock
  ) values (
    v_product.id, btrim(p_presentation_name), p_weight_kg,
    p_cost, p_price, p_price_per_kg, v_initial_stock, v_min_stock
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
    'presentation_id', v_presentation_id,
    'presentation_min_stock', round(v_min_stock, 3)::text
  );
exception
  when numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'NUMERIC_OVERFLOW';
end;
$$;

create or replace function public.create_product_presentation(
  p_product_id uuid,
  p_name text,
  p_weight_kg numeric,
  p_cost numeric,
  p_price numeric,
  p_price_per_kg numeric,
  p_initial_stock numeric,
  p_min_stock numeric
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
  v_min_stock numeric(10,3);
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'AUTHENTICATION_REQUIRED';
  end if;

  -- Preserve the transaction boundary introduced by migration 021: creation
  -- and product archival must serialize on the same per-product lock.
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
  if p_min_stock is null or p_min_stock < 0 or p_min_stock <> round(p_min_stock, 3) then
    raise exception using errcode = 'P0001', message = 'INVALID_MIN_STOCK';
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
  if v_product.type = 'unit' and p_min_stock <> trunc(p_min_stock) then
    raise exception using errcode = 'P0001', message = 'INVALID_UNIT_MIN_STOCK';
  end if;

  v_initial_stock := p_initial_stock;
  v_min_stock := p_min_stock;

  insert into public.product_presentations(
    product_id, name, weight_kg, cost, price, price_per_kg, stock, min_stock
  ) values (
    v_product.id, btrim(p_name), p_weight_kg, p_cost, p_price, p_price_per_kg,
    v_initial_stock, v_min_stock
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
    'min_stock', round(v_presentation.min_stock, 3)::text,
    'created_at', v_presentation.created_at
  );
exception
  when numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'NUMERIC_OVERFLOW';
end;
$$;

-- Rolling-deploy wrapper for clients still using the previous seven-argument RPC.
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
language sql
security definer
set search_path = ''
as $$
  select public.create_product_presentation(
    p_product_id,
    p_name,
    p_weight_kg,
    p_cost,
    p_price,
    p_price_per_kg,
    p_initial_stock,
    coalesce((select p.min_stock from public.products p where p.id = p_product_id), 0::numeric)
  );
$$;

revoke all on function public.create_product_presentation(
  uuid, text, numeric, numeric, numeric, numeric, numeric, numeric
) from public, anon;
grant execute on function public.create_product_presentation(
  uuid, text, numeric, numeric, numeric, numeric, numeric, numeric
) to authenticated;

revoke all on function public.create_product_presentation(
  uuid, text, numeric, numeric, numeric, numeric, numeric
) from public, anon;
grant execute on function public.create_product_presentation(
  uuid, text, numeric, numeric, numeric, numeric, numeric
) to authenticated;

comment on function public.create_product_presentation(
  uuid, text, numeric, numeric, numeric, numeric, numeric, numeric
) is 'Atomically creates a presentation with its own low-stock threshold and optional opening balance.';

create or replace function public.get_dashboard_analytics(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_timezone constant text := 'America/Argentina/Buenos_Aires';
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_days integer;
  v_from_ts timestamptz;
  v_to_ts timestamptz;
  v_previous_from_ts timestamptz;
  v_today_from_ts timestamptz;
  v_today_to_ts timestamptz;
  v_yesterday_from_ts timestamptz;
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception using errcode = 'P0001', message = 'INVALID_DATE_RANGE';
  end if;
  v_days := p_to - p_from + 1;
  if v_days > 366 then
    raise exception using errcode = 'P0001', message = 'DATE_RANGE_TOO_LARGE';
  end if;

  v_from_ts := p_from::timestamp at time zone v_timezone;
  v_to_ts := (p_to + 1)::timestamp at time zone v_timezone;
  v_previous_from_ts := (p_from - v_days)::timestamp at time zone v_timezone;
  v_today_from_ts := v_today::timestamp at time zone v_timezone;
  v_today_to_ts := (v_today + 1)::timestamp at time zone v_timezone;
  v_yesterday_from_ts := (v_today - 1)::timestamp at time zone v_timezone;

  with
  selected_totals as (
    select count(*)::integer sales_count,
           coalesce(sum(s.total_amount), 0::numeric) total_amount,
           coalesce(sum(s.total_cost), 0::numeric) total_cost
    from public.sales s
    where s.created_at >= v_from_ts and s.created_at < v_to_ts
  ),
  previous_totals as (
    select coalesce(sum(s.total_amount), 0::numeric) total_amount,
           coalesce(sum(s.total_cost), 0::numeric) total_cost
    from public.sales s
    where s.created_at >= v_previous_from_ts and s.created_at < v_from_ts
  ),
  today_totals as (
    select count(*)::integer sales_count,
           coalesce(sum(s.total_amount), 0::numeric) total_amount,
           coalesce(sum(s.total_cost), 0::numeric) total_cost
    from public.sales s
    where s.created_at >= v_today_from_ts and s.created_at < v_today_to_ts
  ),
  yesterday_totals as (
    select coalesce(sum(s.total_amount), 0::numeric) total_amount
    from public.sales s
    where s.created_at >= v_yesterday_from_ts and s.created_at < v_today_from_ts
  ),
  sales_by_day as (
    select (s.created_at at time zone v_timezone)::date sale_date,
           count(*)::integer sales_count,
           sum(s.total_amount) total_amount,
           sum(s.total_cost) total_cost,
           sum(s.total_amount - s.total_cost) gross_profit
    from public.sales s
    where s.created_at >= v_from_ts and s.created_at < v_to_ts
    group by 1
  ),
  daily_series as (
    select d::date sale_date,
           coalesce(s.sales_count, 0) sales_count,
           coalesce(s.total_amount, 0::numeric) total_amount,
           coalesce(s.total_cost, 0::numeric) total_cost,
           coalesce(s.gross_profit, 0::numeric) gross_profit
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
    left join sales_by_day s on s.sale_date = d::date
    order by d
  ),
  low_stock_rows as (
    select p.id product_id,
           p.name product_name,
           p.type product_type,
           pp.id presentation_id,
           pp.name presentation_name,
           pp.stock current_stock,
           pp.min_stock
    from public.products p
    join public.product_presentations pp on pp.product_id = p.id
    where p.status = 'active'
      and pp.status = 'active'
      and pp.stock <= pp.min_stock
    order by pp.stock,
             (pp.stock - pp.min_stock),
             p.name,
             pp.name
  ),
  recent_sales_rows as (
    select s.id, s.created_at, s.total_amount, s.total_cost, s.payment_method
    from public.sales s order by s.created_at desc, s.id desc limit 5
  ),
  recent_purchase_rows as (
    select p.id, p.created_at, p.total_amount, p.supplier_id, s.name supplier_name
    from public.purchases p left join public.suppliers s on s.id = p.supplier_id
    order by p.created_at desc, p.id desc limit 5
  )
  select jsonb_build_object(
    'timezone', v_timezone,
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'today', jsonb_build_object(
      'sales_count', tt.sales_count,
      'total_amount', round(tt.total_amount, 2)::text,
      'total_cost', round(tt.total_cost, 2)::text,
      'gross_profit', round(tt.total_amount - tt.total_cost, 2)::text,
      'margin_pct', case when tt.total_amount = 0 then null else round((tt.total_amount - tt.total_cost) * 100 / tt.total_amount, 2)::text end,
      'sales_change_pct', case when yt.total_amount = 0 then null else round((tt.total_amount - yt.total_amount) * 100 / yt.total_amount, 2)::text end
    ),
    'selected_period', jsonb_build_object(
      'sales_count', st.sales_count,
      'total_amount', round(st.total_amount, 2)::text,
      'total_cost', round(st.total_cost, 2)::text,
      'gross_profit', round(st.total_amount - st.total_cost, 2)::text,
      'margin_pct', case when st.total_amount = 0 then null else round((st.total_amount - st.total_cost) * 100 / st.total_amount, 2)::text end,
      'sales_change_pct', case when pt.total_amount = 0 then null else round((st.total_amount - pt.total_amount) * 100 / pt.total_amount, 2)::text end,
      'profit_change_pct', case when (pt.total_amount - pt.total_cost) = 0 then null else round(((st.total_amount - st.total_cost) - (pt.total_amount - pt.total_cost)) * 100 / abs(pt.total_amount - pt.total_cost), 2)::text end
    ),
    'daily_sales', coalesce((select jsonb_agg(jsonb_build_object(
      'date', ds.sale_date,
      'sales_count', ds.sales_count,
      'sales', round(ds.total_amount, 2)::text,
      'total_cost', round(ds.total_cost, 2)::text,
      'gross_profit', round(ds.gross_profit, 2)::text,
      'margin_pct', case when ds.total_amount = 0 then null else round(ds.gross_profit * 100 / ds.total_amount, 2)::text end
    ) order by ds.sale_date) from daily_series ds), '[]'::jsonb),
    'low_stock', coalesce((select jsonb_agg(jsonb_build_object(
      'product_id', l.product_id,
      'product_name', l.product_name,
      'presentation_id', l.presentation_id,
      'presentation_name', l.presentation_name,
      'product_type', l.product_type,
      'current_stock', round(l.current_stock, 3)::text,
      'min_stock', round(l.min_stock, 3)::text,
      'unit', case when l.product_type = 'weight' then 'kg' else 'uds' end
    ) order by l.current_stock, (l.current_stock - l.min_stock), l.product_name, l.presentation_name) from low_stock_rows l), '[]'::jsonb),
    'recent_sales', coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'created_at', r.created_at,
      'total_amount', round(r.total_amount, 2)::text,
      'total_cost', round(r.total_cost, 2)::text,
      'gross_profit', round(r.total_amount - r.total_cost, 2)::text,
      'payment_method', r.payment_method
    ) order by r.created_at desc, r.id desc) from recent_sales_rows r), '[]'::jsonb),
    'recent_purchases', coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'created_at', r.created_at,
      'total_amount', round(r.total_amount, 2)::text,
      'supplier_id', r.supplier_id, 'supplier_name', r.supplier_name
    ) order by r.created_at desc, r.id desc) from recent_purchase_rows r), '[]'::jsonb)
  ) into v_result
  from selected_totals st cross join previous_totals pt
  cross join today_totals tt cross join yesterday_totals yt;

  return v_result;
end;
$$;

revoke all on function public.get_dashboard_analytics(date, date) from public, anon;
grant execute on function public.get_dashboard_analytics(date, date) to authenticated;
