-- Alert for each presentation before it runs out of stock.
-- The product minimum remains configurable; legacy zero values receive a safe
-- preventive threshold of 5 units or 5 kg.

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
           greatest(coalesce(p.min_stock, 0::numeric), 5::numeric) min_stock
    from public.products p
    join public.product_presentations pp on pp.product_id = p.id
    where p.status = 'active'
      and pp.stock <= greatest(coalesce(p.min_stock, 0::numeric), 5::numeric)
    order by pp.stock,
             (pp.stock - greatest(coalesce(p.min_stock, 0::numeric), 5::numeric)),
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

comment on function public.get_dashboard_analytics(date, date) is
  'Stage 05 dashboard metrics with preventive low-stock alerts per presentation.';
