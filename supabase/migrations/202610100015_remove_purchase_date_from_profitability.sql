-- The profitability export shows the selected period and the exact sale date.
-- Purchase dates are intentionally excluded because stock is not lot-tracked.

create or replace function public.get_profitability_detail_report(p_from date, p_to date)
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
    'sale_id', q.sale_id,
    'sale_item_id', q.sale_item_id,
    'sale_date', q.sale_date,
    'product_id', q.product_id,
    'product_name', q.product_name,
    'presentation_name', q.presentation_name,
    'product_type', q.product_type,
    'unit', case when q.product_type = 'weight' then 'kg' else 'uds' end,
    'payment_method', q.payment_method,
    'stock_quantity', round(q.stock_quantity, 3)::text,
    'total_amount', round(q.total_amount, 2)::text,
    'total_cost', round(q.total_cost, 2)::text,
    'gross_profit', round(q.gross_profit, 2)::text,
    'margin_pct', case
      when q.total_amount = 0 then null
      else round(q.gross_profit * 100 / q.total_amount, 2)::text
    end
  ) order by q.sale_date desc, q.sale_id, q.sale_item_id), '[]'::jsonb)
  into v_result
  from (
    select s.id sale_id,
           si.id sale_item_id,
           s.created_at sale_date,
           p.id product_id,
           p.name product_name,
           coalesce(pp.name, 'Presentación eliminada') presentation_name,
           p.type product_type,
           s.payment_method,
           si.quantity stock_quantity,
           si.subtotal total_amount,
           si.cost total_cost,
           si.subtotal - si.cost gross_profit
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
    join public.products p on p.id = si.product_id
    left join public.product_presentations pp on pp.id = si.presentation_id
    where s.created_at >= v_from_ts and s.created_at < v_to_ts
  ) q;

  return v_result;
end;
$$;

revoke all on function public.get_profitability_detail_report(date, date) from public, anon;
grant execute on function public.get_profitability_detail_report(date, date) to authenticated;

comment on function public.get_profitability_detail_report(date, date) is
  'Transaction-level profitability with exact sale date; selected period is supplied by the export request.';
