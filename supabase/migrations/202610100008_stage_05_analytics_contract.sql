-- Stage 05: indexed, RLS-aware analytics contracts.
-- All monetary and quantity values are returned as decimal strings.

create index if not exists sales_created_at_idx on public.sales (created_at desc);
create index if not exists sales_payment_method_created_at_idx on public.sales (payment_method, created_at desc);
create index if not exists sale_items_sale_id_idx on public.sale_items (sale_id);
create index if not exists sale_items_product_id_idx on public.sale_items (product_id);
create index if not exists sale_items_presentation_id_idx on public.sale_items (presentation_id);
create index if not exists purchases_created_at_idx on public.purchases (created_at desc);
create index if not exists purchases_supplier_id_idx on public.purchases (supplier_id);
create index if not exists purchase_items_purchase_id_idx on public.purchase_items (purchase_id);
create index if not exists purchase_items_product_id_idx on public.purchase_items (product_id);
create index if not exists purchase_items_presentation_id_idx on public.purchase_items (presentation_id);
create index if not exists inventory_movements_created_at_idx on public.inventory_movements (created_at desc);
create index if not exists inventory_movements_product_created_at_idx on public.inventory_movements (product_id, created_at desc);
create index if not exists inventory_movements_presentation_id_idx on public.inventory_movements (presentation_id);
create index if not exists inventory_movements_type_created_at_idx on public.inventory_movements (type, created_at desc);
create index if not exists product_presentations_product_id_idx on public.product_presentations (product_id);
create index if not exists products_category_id_idx on public.products (category_id);

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
           sum(s.total_amount) total_amount,
           sum(s.total_amount - s.total_cost) gross_profit
    from public.sales s
    where s.created_at >= v_from_ts and s.created_at < v_to_ts
    group by 1
  ),
  daily_series as (
    select d::date sale_date,
           coalesce(s.total_amount, 0::numeric) total_amount,
           coalesce(s.gross_profit, 0::numeric) gross_profit
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
    left join sales_by_day s on s.sale_date = d::date
    order by d
  ),
  low_stock_rows as (
    select p.id product_id, p.name product_name, p.type product_type,
           coalesce(sum(pp.stock), 0::numeric) current_stock,
           coalesce(p.min_stock, 0::numeric) min_stock
    from public.products p
    left join public.product_presentations pp on pp.product_id = p.id
    where p.status = 'active'
    group by p.id, p.name, p.type, p.min_stock
    having coalesce(sum(pp.stock), 0::numeric) <= coalesce(p.min_stock, 0::numeric)
    order by (coalesce(sum(pp.stock), 0::numeric) - coalesce(p.min_stock, 0::numeric)), p.name
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
      'date', ds.sale_date, 'sales', round(ds.total_amount, 2)::text,
      'gross_profit', round(ds.gross_profit, 2)::text
    ) order by ds.sale_date) from daily_series ds), '[]'::jsonb),
    'low_stock', coalesce((select jsonb_agg(jsonb_build_object(
      'product_id', l.product_id, 'product_name', l.product_name,
      'product_type', l.product_type, 'current_stock', round(l.current_stock, 3)::text,
      'min_stock', round(l.min_stock, 3)::text,
      'unit', case when l.product_type = 'weight' then 'kg' else 'uds' end
    ) order by (l.current_stock - l.min_stock), l.product_name) from low_stock_rows l), '[]'::jsonb),
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

create or replace function public.get_product_profitability_report(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_timezone constant text := 'America/Argentina/Buenos_Aires';
  v_from_ts timestamptz;
  v_to_ts timestamptz;
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception using errcode = 'P0001', message = 'INVALID_DATE_RANGE';
  end if;
  if p_to - p_from + 1 > 366 then
    raise exception using errcode = 'P0001', message = 'DATE_RANGE_TOO_LARGE';
  end if;
  v_from_ts := p_from::timestamp at time zone v_timezone;
  v_to_ts := (p_to + 1)::timestamp at time zone v_timezone;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id', q.product_id, 'product_name', q.product_name,
    'product_type', q.product_type,
    'unit', case when q.product_type = 'weight' then 'kg' else 'uds' end,
    'sales_count', q.sales_count, 'stock_quantity', round(q.stock_quantity, 3)::text,
    'total_amount', round(q.total_amount, 2)::text,
    'total_cost', round(q.total_cost, 2)::text,
    'gross_profit', round(q.gross_profit, 2)::text,
    'margin_pct', case when q.total_amount = 0 then null else round(q.gross_profit * 100 / q.total_amount, 2)::text end
  ) order by q.gross_profit desc, q.product_name), '[]'::jsonb)
  into v_result
  from (
    select p.id product_id, p.name product_name, p.type product_type,
           count(distinct s.id)::integer sales_count, sum(si.quantity) stock_quantity,
           sum(si.subtotal) total_amount, sum(si.cost) total_cost,
           sum(si.subtotal - si.cost) gross_profit
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
    join public.products p on p.id = si.product_id
    where s.created_at >= v_from_ts and s.created_at < v_to_ts
    group by p.id, p.name, p.type
  ) q;
  return v_result;
end;
$$;

create or replace function public.get_payment_method_report(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_timezone constant text := 'America/Argentina/Buenos_Aires';
  v_from_ts timestamptz;
  v_to_ts timestamptz;
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception using errcode = 'P0001', message = 'INVALID_DATE_RANGE';
  end if;
  if p_to - p_from + 1 > 366 then
    raise exception using errcode = 'P0001', message = 'DATE_RANGE_TOO_LARGE';
  end if;
  v_from_ts := p_from::timestamp at time zone v_timezone;
  v_to_ts := (p_to + 1)::timestamp at time zone v_timezone;

  with methods(payment_method, sort_order) as (
    values ('efectivo', 1), ('transferencia', 2), ('debito', 3),
           ('credito', 4), ('mercado_pago', 5), ('otro', 6)
  ),
  totals as (
    select s.payment_method, count(*)::integer sales_count, sum(s.total_amount) total_amount
    from public.sales s
    where s.created_at >= v_from_ts and s.created_at < v_to_ts
    group by s.payment_method
  ),
  grand_total as (select coalesce(sum(total_amount), 0::numeric) total_amount from totals)
  select jsonb_agg(jsonb_build_object(
    'payment_method', m.payment_method,
    'sales_count', coalesce(t.sales_count, 0),
    'total_amount', round(coalesce(t.total_amount, 0::numeric), 2)::text,
    'share_pct', case when g.total_amount = 0 then '0.00' else round(coalesce(t.total_amount, 0::numeric) * 100 / g.total_amount, 2)::text end
  ) order by m.sort_order)
  into v_result
  from methods m left join totals t on t.payment_method = m.payment_method
  cross join grand_total g;
  return v_result;
end;
$$;

create or replace function public.get_inventory_movement_report(
  p_from date, p_to date, p_type text default null, p_product_id uuid default null,
  p_limit integer default 100, p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_timezone constant text := 'America/Argentina/Buenos_Aires';
  v_from_ts timestamptz;
  v_to_ts timestamptz;
  v_total bigint;
  v_items jsonb;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception using errcode = 'P0001', message = 'INVALID_DATE_RANGE';
  end if;
  if p_to - p_from + 1 > 366 then
    raise exception using errcode = 'P0001', message = 'DATE_RANGE_TOO_LARGE';
  end if;
  if p_type is not null and p_type not in ('compra', 'venta', 'ajuste', 'merma') then
    raise exception using errcode = 'P0001', message = 'INVALID_MOVEMENT_TYPE';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception using errcode = 'P0001', message = 'INVALID_LIMIT';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception using errcode = 'P0001', message = 'INVALID_OFFSET';
  end if;
  v_from_ts := p_from::timestamp at time zone v_timezone;
  v_to_ts := (p_to + 1)::timestamp at time zone v_timezone;

  select count(*) into v_total
  from public.inventory_movements m
  where m.created_at >= v_from_ts and m.created_at < v_to_ts
    and (p_type is null or m.type = p_type)
    and (p_product_id is null or m.product_id = p_product_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id, 'created_at', q.created_at, 'type', q.type,
    'product_id', q.product_id, 'product_name', q.product_name,
    'presentation_id', q.presentation_id, 'presentation_name', q.presentation_name,
    'quantity', round(q.quantity, 3)::text,
    'unit', case when q.product_type = 'weight' then 'kg' else 'uds' end,
    'reason', q.reason, 'reference_type', q.reference_type, 'reference_id', q.reference_id
  ) order by q.created_at desc, q.id desc), '[]'::jsonb)
  into v_items
  from (
    select m.id, m.created_at, m.type, m.product_id, p.name product_name,
           p.type product_type, m.presentation_id, pp.name presentation_name,
           m.quantity, m.reason, m.reference_type, m.reference_id
    from public.inventory_movements m
    left join public.products p on p.id = m.product_id
    left join public.product_presentations pp on pp.id = m.presentation_id
    where m.created_at >= v_from_ts and m.created_at < v_to_ts
      and (p_type is null or m.type = p_type)
      and (p_product_id is null or m.product_id = p_product_id)
    order by m.created_at desc, m.id desc
    limit p_limit offset p_offset
  ) q;

  return jsonb_build_object('total_count', v_total, 'items', v_items);
end;
$$;

revoke all on function public.get_dashboard_analytics(date, date) from public, anon;
revoke all on function public.get_product_profitability_report(date, date) from public, anon;
revoke all on function public.get_payment_method_report(date, date) from public, anon;
revoke all on function public.get_inventory_movement_report(date, date, text, uuid, integer, integer) from public, anon;

grant execute on function public.get_dashboard_analytics(date, date) to authenticated;
grant execute on function public.get_product_profitability_report(date, date) to authenticated;
grant execute on function public.get_payment_method_report(date, date) to authenticated;
grant execute on function public.get_inventory_movement_report(date, date, text, uuid, integer, integer) to authenticated;

comment on function public.get_dashboard_analytics(date, date) is
  'Stage 05 dashboard metrics in America/Argentina/Buenos_Aires; decimals are strings.';
comment on function public.get_product_profitability_report(date, date) is
  'Stage 05 historical product profitability; decimals are strings.';
comment on function public.get_payment_method_report(date, date) is
  'Stage 05 payment method totals including zero-value canonical methods.';
comment on function public.get_inventory_movement_report(date, date, text, uuid, integer, integer) is
  'Stage 05 paginated inventory movement report.';
