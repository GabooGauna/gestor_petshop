-- Production post-deploy gate. It performs no commercial writes.
begin transaction read only;
set local statement_timeout = '20s';
set local lock_timeout = '2s';

do $$
declare
  v_020_hash constant text :=
    'a9704c7ffe5348f13068f671a954d1fffe74612fc77e0dfb3e4edcc9b7e3a457';
  v_021_hash constant text :=
    '6db8ba5019b585b105fcb96d586b96202d6ff721f24f68d40a0818b40a14e776';
begin
  if current_setting('transaction_read_only') <> 'on' then
    raise exception 'POSTDEPLOY_NOT_READ_ONLY';
  end if;

  if not exists (
    select 1
    from supabase_migrations.schema_migrations
    where name = 'last_purchase_cost_snapshot'
      and encode(
        extensions.digest(convert_to(statements[1], 'UTF8'), 'sha256'), 'hex'
      ) = v_020_hash
  ) then
    raise exception '020_HISTORY_OR_HASH_MISMATCH';
  end if;

  if not exists (
    select 1
    from supabase_migrations.schema_migrations
    where name = 'reconcile_historical_transaction_hardening'
      and encode(
        extensions.digest(convert_to(statements[1], 'UTF8'), 'sha256'), 'hex'
      ) = v_021_hash
  ) then
    raise exception '021_HISTORY_OR_HASH_MISMATCH';
  end if;

  if (select count(*) from information_schema.columns
      where table_schema = 'public'
        and table_name = 'sale_items'
        and column_name in (
          'replacement_cost_snapshot',
          'presentation_weight_snapshot',
          'cost_basis'
        )) <> 3
    or not exists (
      select 1 from pg_trigger
      where tgrelid = to_regclass('public.sale_items')
        and tgname = 'sale_items_capture_cost_snapshot'
        and not tgisinternal
    )
    or not exists (
      select 1 from pg_trigger
      where tgrelid = to_regclass('public.sale_items')
        and tgname = 'sale_items_protect_cost_snapshot'
        and not tgisinternal
    ) then
    raise exception '020_STRUCTURAL_FINGERPRINT_MISMATCH';
  end if;

  if to_regprocedure('public.ensure_presentation_product_active_on_update()') is null
    or not exists (
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
    ) = 0
    or position(
      'pg_advisory_xact_lock' in
      pg_get_functiondef(to_regprocedure('public.delete_product(uuid)'))
    ) = 0
    or has_column_privilege(
      'authenticated', 'public.product_presentations', 'product_id', 'UPDATE'
    ) then
    raise exception '021_STRUCTURAL_FINGERPRINT_MISMATCH';
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
    raise exception 'POSTDEPLOY_REPLACEMENT_COST_MISMATCH';
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
  ) or exists (
    select 1
    from public.purchases p
    cross join lateral (
      select coalesce(sum(pi.subtotal), 0)::numeric(12,2) amount
      from public.purchase_items pi
      where pi.purchase_id = p.id
    ) sums
    where p.total_amount is distinct from sums.amount
  ) then
    raise exception 'POSTDEPLOY_TRANSACTION_TOTAL_MISMATCH';
  end if;

  if exists (select 1 from public.product_presentations where stock < 0)
    or exists (
      select 1
      from public.product_presentations pp
      where pp.stock is distinct from coalesce((
        select sum(im.quantity)
        from public.inventory_movements im
        where im.presentation_id = pp.id
      ), 0)
    ) then
    raise exception 'POSTDEPLOY_STOCK_OR_KARDEX_MISMATCH';
  end if;

  if exists (
    select 1 from pg_stat_activity
    where datname = current_database()
      and pid <> pg_backend_pid()
      and (backend_xid is not null or wait_event_type = 'Lock')
  ) then
    raise exception 'POSTDEPLOY_ACTIVE_WRITE_OR_LOCK';
  end if;
end
$$;

select jsonb_build_object(
  'status', 'passed',
  'historical_rows_without_snapshot', (
    select count(*) from public.sale_items
    where replacement_cost_snapshot is null
       or presentation_weight_snapshot is null
       or cost_basis is null
  ),
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
) as production_postdeploy;

rollback;
