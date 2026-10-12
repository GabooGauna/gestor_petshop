-- Run only through the Supabase MCP read-only SQL operation. This script does
-- not mutate the database and returns only schema metadata and aggregate counts.
begin transaction read only;
set local statement_timeout = '15s';
set local lock_timeout = '2s';

-- Registered migration state. Absence from this result means "not registered";
-- it does not by itself prove that the corresponding DDL is absent.
select
  version,
  name,
  encode(
    extensions.digest(convert_to(statements[1], 'UTF8'), 'sha256'),
    'hex'
  ) as recorded_statement_sha256,
  case name
    when 'decimal_presentation_response' then
      encode(extensions.digest(convert_to(statements[1], 'UTF8'), 'sha256'), 'hex') =
        'c5ae2121eca773bc95c0bd5db3b17b82cb9b14f62bde40e20d759fdbb855e4ae'
    when 'logical_product_removal' then
      encode(extensions.digest(convert_to(statements[1], 'UTF8'), 'sha256'), 'hex') =
        '31aed561face8795e9d7016d8b3b90560b2490d61457547e7dc86edd85da8925'
    when 'last_purchase_cost_snapshot' then
      encode(extensions.digest(convert_to(statements[1], 'UTF8'), 'sha256'), 'hex') =
        'a9704c7ffe5348f13068f671a954d1fffe74612fc77e0dfb3e4edcc9b7e3a457'
    else false
  end as matches_approved_file
from supabase_migrations.schema_migrations
where name in (
  'decimal_presentation_response',
  'logical_product_removal',
  'last_purchase_cost_snapshot'
)
order by version;

-- Structural fingerprints are checked independently from migration history so
-- manual or partially applied DDL cannot be mistaken for a clean state.
select
  obj_description(
    to_regprocedure('public.create_product_presentation(uuid,text,numeric,numeric,numeric,numeric,numeric)'),
    'pg_proc'
  ) = 'Atomically creates a presentation and serializes exact decimal values as JSON strings.'
    and position(
      'pg_advisory_xact_lock' in pg_get_functiondef(
        to_regprocedure('public.create_product_presentation(uuid,text,numeric,numeric,numeric,numeric,numeric)')
      )
    ) > 0
    as migration_018_fingerprint,
  obj_description(to_regprocedure('public.delete_product(uuid)'), 'pg_proc') =
    'Archives an active product without deleting stock, movements, purchases or sales history.'
    and to_regclass('public.product_presentations') is not null
    and exists (
      select 1
      from pg_trigger
      where tgrelid = to_regclass('public.product_presentations')
        and tgname = 'presentations_require_active_product_on_update'
        and not tgisinternal
    )
    and to_regprocedure('public.ensure_presentation_product_active_on_update()') is not null
    and not has_column_privilege(
      'authenticated', 'public.product_presentations', 'product_id', 'UPDATE'
    )
    and position(
      'pg_advisory_xact_lock' in
      pg_get_functiondef(to_regprocedure('public.delete_product(uuid)'))
    ) > 0 as migration_019_fingerprint,
  (
    select count(*) = 3
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sale_items'
      and column_name in (
        'replacement_cost_snapshot',
        'presentation_weight_snapshot',
        'cost_basis'
      )
  )
  and exists (
    select 1 from pg_trigger
    where tgrelid = to_regclass('public.sale_items')
      and tgname = 'sale_items_capture_cost_snapshot'
      and not tgisinternal
  )
  and exists (
    select 1 from pg_trigger
    where tgrelid = to_regclass('public.sale_items')
      and tgname = 'sale_items_protect_cost_snapshot'
      and not tgisinternal
  ) as migration_020_fingerprint;

-- Required runtime and application dependencies. This reports names only.
with required(kind, object_name, present) as (
  values
    ('table', 'public.categories', to_regclass('public.categories') is not null),
    ('table', 'public.suppliers', to_regclass('public.suppliers') is not null),
    ('table', 'public.products', to_regclass('public.products') is not null),
    ('table', 'public.product_presentations', to_regclass('public.product_presentations') is not null),
    ('table', 'public.sales', to_regclass('public.sales') is not null),
    ('table', 'public.sale_items', to_regclass('public.sale_items') is not null),
    ('table', 'public.purchases', to_regclass('public.purchases') is not null),
    ('table', 'public.purchase_items', to_regclass('public.purchase_items') is not null),
    ('table', 'public.inventory_movements', to_regclass('public.inventory_movements') is not null),
    ('function', 'auth.uid()', to_regprocedure('auth.uid()') is not null),
    ('function', 'public.process_sale(text,jsonb)', to_regprocedure('public.process_sale(text,jsonb)') is not null),
    ('function', 'public.process_purchase(uuid,text,jsonb)', to_regprocedure('public.process_purchase(uuid,text,jsonb)') is not null),
    ('function', 'public.create_product_presentation(uuid,text,numeric,numeric,numeric,numeric,numeric)',
      to_regprocedure('public.create_product_presentation(uuid,text,numeric,numeric,numeric,numeric,numeric)') is not null),
    ('function', 'public.delete_product(uuid)', to_regprocedure('public.delete_product(uuid)') is not null),
    ('function', 'public.record_shrinkage(uuid,numeric,text)',
      to_regprocedure('public.record_shrinkage(uuid,numeric,text)') is not null),
    ('function', 'public.record_stock_adjustment(uuid,numeric,text)',
      to_regprocedure('public.record_stock_adjustment(uuid,numeric,text)') is not null),
    ('function', 'public.get_profitability_detail_report(date,date)',
      to_regprocedure('public.get_profitability_detail_report(date,date)') is not null)
)
select kind, object_name, present
from required
order by kind, object_name;

-- Aggregate-only integrity preflight: no commercial rows or identifiers leave
-- the database. Non-zero values block rollout and require separate diagnosis.
select
  (
    select count(*)
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
  ) as replacement_cost_mismatch_count,
  (
    select count(*)
    from public.sales s
    cross join lateral (
      select
        coalesce(sum(si.subtotal), 0)::numeric(12,2) as item_amount,
        coalesce(sum(si.cost), 0)::numeric(12,2) as item_cost
      from public.sale_items si
      where si.sale_id = s.id
    ) sums
    where s.total_amount is distinct from sums.item_amount
       or s.total_cost is distinct from sums.item_cost
  ) as sale_total_mismatch_count,
  (
    select count(*)
    from public.product_presentations
    where stock < 0
  ) as negative_stock_count,
  (
    select count(*)
    from public.product_presentations pp
    where pp.stock is distinct from coalesce((
      select sum(im.quantity)
      from public.inventory_movements im
      where im.presentation_id = pp.id
    ), 0)
  ) as kardex_mismatch_count,
  (select count(*) from public.sale_items) as historical_sale_item_count;

-- Operational risk snapshot without query text, user names, or application data.
select
  count(*) filter (
    where pid <> pg_backend_pid()
      and xact_start is not null
      and clock_timestamp() - xact_start > interval '1 minute'
  ) as transactions_over_one_minute,
  count(*) filter (
    where pid <> pg_backend_pid()
      and wait_event_type = 'Lock'
  ) as sessions_waiting_on_locks,
  coalesce(max(clock_timestamp() - xact_start) filter (
    where pid <> pg_backend_pid() and xact_start is not null
  ), interval '0') as oldest_transaction_age
from pg_stat_activity
where datname = current_database();

rollback;
