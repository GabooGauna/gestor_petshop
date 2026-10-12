-- Logical lifecycle for product presentations.
-- Requires the transaction/cost contracts from migrations 020 and 021.
-- This file is intentionally local until explicit authorization for remote use.

do $$
begin
  if to_regprocedure('public.process_sale(text,jsonb)') is null
     or to_regprocedure('public.process_purchase(uuid,text,jsonb)') is null
     or to_regprocedure('public.record_shrinkage(uuid,numeric,text)') is null
     or to_regprocedure('public.record_stock_adjustment(uuid,numeric,text)') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'sale_items'
         and column_name = 'replacement_cost_snapshot'
     ) then
    raise exception using errcode = 'P0001', message = 'PETSTOCK_020_021_REQUIRED';
  end if;
end $$;

alter table public.product_presentations
  add column if not exists status text not null default 'active';

alter table public.product_presentations
  add constraint product_presentations_status_check
    check (status in ('active', 'inactive')) not valid;

alter table public.product_presentations
  validate constraint product_presentations_status_check;

create index if not exists product_presentations_product_status_idx
  on public.product_presentations(product_id, status);

comment on column public.product_presentations.status is
  'Operational lifecycle. Inactive presentations preserve stock and history but reject every stock mutation.';

-- Direct catalog writes may only edit active rows and cannot perform lifecycle
-- transitions. SECURITY DEFINER lifecycle RPCs bypass RLS deliberately.
alter policy presentations_authenticated_insert on public.product_presentations
  with check (
    (select auth.uid()) is not null
    and status = 'active'
    and exists (
      select 1 from public.products
      where products.id = product_presentations.product_id
        and products.status = 'active'
    )
  );

alter policy presentations_authenticated_update on public.product_presentations
  using (
    (select auth.uid()) is not null
    and status = 'active'
    and exists (
      select 1 from public.products
      where products.id = product_presentations.product_id
        and products.status = 'active'
    )
  )
  with check (
    (select auth.uid()) is not null
    and status = 'active'
    and exists (
      select 1 from public.products
      where products.id = product_presentations.product_id
        and products.status = 'active'
    )
  );

-- A table-level UPDATE grant implicitly includes every column, so revoking only the
-- status column would not prevent direct lifecycle transitions. Restore only the
-- catalog columns that were writable after 020/021: cost remains purchase-only,
-- stock remains transactional, and identity/audit columns remain immutable.
revoke update on public.product_presentations from authenticated;
grant update (
  name, weight_kg, price, price_per_kg
) on public.product_presentations to authenticated;

-- This trigger runs after PostgreSQL owns the presentation row lock. Therefore it
-- observes the winning lifecycle state even when an UPDATE first waited behind an
-- archive transaction. Status transitions must be pure: no stock, cost, price,
-- identity or descriptive change may hitchhike on them.
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
       or new.created_at is distinct from old.created_at
     ) then
    raise exception using errcode = 'P0001', message = 'INVALID_PRESENTATION_STATUS_TRANSITION';
  end if;

  return new;
end;
$$;

drop trigger if exists presentations_enforce_lifecycle_on_update
  on public.product_presentations;
create trigger presentations_enforce_lifecycle_on_update
before update on public.product_presentations
for each row execute function public.enforce_presentation_lifecycle_on_update();

revoke execute on function public.enforce_presentation_lifecycle_on_update()
  from public, anon, authenticated;

create or replace function public.archive_presentation(p_presentation_id uuid)
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
  if v_presentation.status = 'inactive' then
    raise exception using errcode = 'P0001', message = 'PRESENTATION_ALREADY_INACTIVE';
  end if;

  update public.product_presentations
  set status = 'inactive'
  where id = p_presentation_id;

  return jsonb_build_object(
    'presentation_id', v_presentation.id,
    'product_id', v_presentation.product_id,
    'name', v_presentation.name,
    'status', 'inactive',
    'archived', true,
    'reactivated', false
  );
end;
$$;

create or replace function public.reactivate_presentation(p_presentation_id uuid)
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
  if v_presentation.status = 'active' then
    raise exception using errcode = 'P0001', message = 'PRESENTATION_ALREADY_ACTIVE';
  end if;

  update public.product_presentations
  set status = 'active'
  where id = p_presentation_id;

  return jsonb_build_object(
    'presentation_id', v_presentation.id,
    'product_id', v_presentation.product_id,
    'name', v_presentation.name,
    'status', 'active',
    'archived', false,
    'reactivated', true
  );
end;
$$;

-- Compatibility barrier: old clients calling delete_presentation now archive and
-- can no longer physically delete a historical or unused presentation.
create or replace function public.delete_presentation(p_presentation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  v_result := public.archive_presentation(p_presentation_id);
  return v_result || jsonb_build_object('deleted', false);
end;
$$;

revoke all on function public.archive_presentation(uuid) from public, anon;
revoke all on function public.reactivate_presentation(uuid) from public, anon;
revoke all on function public.delete_presentation(uuid) from public, anon;
grant execute on function public.archive_presentation(uuid) to authenticated;
grant execute on function public.reactivate_presentation(uuid) to authenticated;
grant execute on function public.delete_presentation(uuid) to authenticated;

comment on function public.archive_presentation(uuid) is
  'Archives a presentation without changing stock, replacement cost or historical references.';
comment on function public.reactivate_presentation(uuid) is
  'Reactivates an archived presentation under an active product without changing inventory.';
comment on function public.delete_presentation(uuid) is
  'Compatibility alias that archives a presentation; physical deletion is no longer supported.';

-- Historical analytics remain state-agnostic. Only the operational low-stock
-- alert excludes archived presentations.
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
      and pp.status = 'active'
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
  'Dashboard metrics with preventive low-stock alerts limited to active presentations.';

