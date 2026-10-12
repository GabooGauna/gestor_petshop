-- Production gate for the audited pre-020 state.
-- Read-only: returns metadata and aggregate counts only.
begin transaction read only;
set local statement_timeout = '20s';
set local lock_timeout = '2s';

do $$
begin
  if current_setting('transaction_read_only') <> 'on' then
    raise exception 'PREFLIGHT_NOT_READ_ONLY';
  end if;

  if not exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20261011070018' and name = 'decimal_presentation_response'
  ) or not exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20261011070019' and name = 'logical_product_removal'
  ) then
    raise exception 'EXPECTED_HISTORICAL_018_019_NOT_FOUND';
  end if;

  if exists (
    select 1 from supabase_migrations.schema_migrations
    where name in (
      'last_purchase_cost_snapshot',
      'reconcile_historical_transaction_hardening'
    )
  ) then
    raise exception '020_OR_021_ALREADY_REGISTERED';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sale_items'
      and column_name in (
        'replacement_cost_snapshot',
        'presentation_weight_snapshot',
        'cost_basis'
      )
  ) then
    raise exception '020_DDL_ALREADY_PRESENT';
  end if;

  if to_regprocedure('public.ensure_presentation_product_active_on_update()') is not null
    or exists (
      select 1 from pg_trigger
      where tgrelid = to_regclass('public.product_presentations')
        and tgname = 'presentations_require_active_product_on_update'
        and not tgisinternal
    )
    or position(
      'pg_advisory_xact_lock' in pg_get_functiondef(
        to_regprocedure(
          'public.create_product_presentation(uuid,text,numeric,numeric,numeric,numeric,numeric)'
        )
      )
    ) > 0
    or position(
      'pg_advisory_xact_lock' in
      pg_get_functiondef(to_regprocedure('public.delete_product(uuid)'))
    ) > 0
    or not has_column_privilege(
      'authenticated', 'public.product_presentations', 'product_id', 'UPDATE'
    ) then
    raise exception 'REMOTE_NO_LONGER_MATCHES_AUDITED_PRE_021_STATE';
  end if;

  if exists (
    select 1
    from public.product_presentations pp
    join lateral (
      select pi.unit_cost
      from public.purchase_items pi
      join public.purchases p on p.id = pi.purchase_id
      where pi.presentation_id = pp.id
      order by p.created_at desc, p.id desc, pi.id desc
      limit 1
    ) latest on true
    where pp.cost is distinct from latest.unit_cost
  ) then
    raise exception 'REPLACEMENT_COST_MISMATCH';
  end if;

  if exists (
    select 1
    from public.sales s
    cross join lateral (
      select
        coalesce(sum(si.subtotal), 0)::numeric(12,2) amount,
        coalesce(sum(si.cost), 0)::numeric(12,2) cost
      from public.sale_items si
      where si.sale_id = s.id
    ) sums
    where s.total_amount is distinct from sums.amount
       or s.total_cost is distinct from sums.cost
  ) then
    raise exception 'SALE_TOTAL_MISMATCH';
  end if;

  if exists (
    select 1
    from public.purchases p
    cross join lateral (
      select coalesce(sum(pi.subtotal), 0)::numeric(12,2) amount
      from public.purchase_items pi
      where pi.purchase_id = p.id
    ) sums
    where p.total_amount is distinct from sums.amount
  ) then
    raise exception 'PURCHASE_TOTAL_MISMATCH';
  end if;

  if exists (select 1 from public.product_presentations where stock < 0) then
    raise exception 'NEGATIVE_STOCK';
  end if;

  if exists (
    select 1
    from public.product_presentations pp
    where pp.stock is distinct from coalesce((
      select sum(im.quantity)
      from public.inventory_movements im
      where im.presentation_id = pp.id
    ), 0)
  ) then
    raise exception 'KARDEX_MISMATCH';
  end if;

  if exists (
    select 1
    from public.sale_items si
    join public.product_presentations pp on pp.id = si.presentation_id
    where si.product_id is distinct from pp.product_id
  ) or exists (
    select 1
    from public.purchase_items pi
    join public.product_presentations pp on pp.id = pi.presentation_id
    where pi.product_id is distinct from pp.product_id
  ) then
    raise exception 'TRANSACTION_PRODUCT_PRESENTATION_MISMATCH';
  end if;

  if exists (
    select 1 from pg_stat_activity
    where datname = current_database()
      and pid <> pg_backend_pid()
      and (
        backend_xid is not null
        or wait_event_type = 'Lock'
        or (xact_start is not null and clock_timestamp() - xact_start > interval '1 minute')
      )
  ) then
    raise exception 'ACTIVE_WRITE_LOCK_OR_LONG_TRANSACTION';
  end if;
end
$$;

select jsonb_build_object(
  'status', 'ready',
  'server_version', current_setting('server_version'),
  'table_counts', jsonb_build_object(
    'categories', (select count(*) from public.categories),
    'suppliers', (select count(*) from public.suppliers),
    'products', (select count(*) from public.products),
    'product_presentations', (select count(*) from public.product_presentations),
    'sales', (select count(*) from public.sales),
    'sale_items', (select count(*) from public.sale_items),
    'purchases', (select count(*) from public.purchases),
    'purchase_items', (select count(*) from public.purchase_items),
    'inventory_movements', (select count(*) from public.inventory_movements)
  )
) as production_preflight;

rollback;
