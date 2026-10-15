\set ON_ERROR_STOP on

-- Read-only compatibility and integrity gate after 022 and before 023.
begin read only;

do $$
declare
  v_migration_020 boolean;
  v_migration_021 boolean;
  v_migration_022 boolean;
  v_migration_023 boolean;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    if current_setting('petstock.environment', true) is distinct from 'e2e' then
      raise exception 'PETSTOCK_MIGRATION_HISTORY_REQUIRED';
    end if;
    v_migration_020 := true;
    v_migration_021 := true;
    v_migration_022 := true;
    v_migration_023 := false;
  else
    select exists (
      select 1 from supabase_migrations.schema_migrations
      where version = '20261012154544' and name = 'last_purchase_cost_snapshot'
    ) into v_migration_020;
    select exists (
      select 1 from supabase_migrations.schema_migrations
      where version = '20261012154611' and name = 'reconcile_historical_transaction_hardening'
    ) into v_migration_021;
    select exists (
      select 1 from supabase_migrations.schema_migrations
      where version = '20261012201823' and name = 'logical_presentation_lifecycle'
    ) into v_migration_022;
    select exists (
      select 1 from supabase_migrations.schema_migrations
      where name = 'configurable_presentation_min_stock'
    ) into v_migration_023;
  end if;

  if not v_migration_020 or not v_migration_021 or not v_migration_022 then
    raise exception 'PETSTOCK_020_021_022_REQUIRED';
  end if;
  if v_migration_023
     or exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'product_presentations'
         and column_name = 'min_stock'
     )
     or to_regprocedure('public.create_product_presentation(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric)') is not null
  then
    raise exception 'PETSTOCK_023_ALREADY_PRESENT_OR_PARTIAL';
  end if;

  if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'product_presentations'
        and column_name = 'status' and is_nullable = 'NO'
    )
    or to_regprocedure('public.archive_presentation(uuid)') is null
    or to_regprocedure('public.reactivate_presentation(uuid)') is null
    or to_regprocedure('public.create_product_presentation(uuid,text,numeric,numeric,numeric,numeric,numeric)') is null
    or to_regprocedure('public.get_dashboard_analytics(date,date)') is null
  then
    raise exception 'PETSTOCK_022_CONTRACT_MISSING';
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from public.products
    where min_stock is null or min_stock < 0 or min_stock <> round(min_stock, 3)
       or (type = 'unit' and min_stock <> trunc(min_stock))
  ) then
    raise exception 'PETSTOCK_023_INVALID_LEGACY_MINIMUM';
  end if;
  if exists (select 1 from public.product_presentations where stock < 0) then
    raise exception 'PETSTOCK_NEGATIVE_STOCK';
  end if;
  if exists (
    select 1
    from public.product_presentations pp
    left join (
      select presentation_id, sum(quantity) quantity
      from public.inventory_movements
      where presentation_id is not null
      group by presentation_id
    ) m on m.presentation_id = pp.id
    where pp.stock is distinct from coalesce(m.quantity, 0)
  ) then
    raise exception 'PETSTOCK_STOCK_KARDEX_MISMATCH';
  end if;
  if exists (
    select 1
    from public.product_presentations pp
    join lateral (
      select pi.unit_cost
      from public.purchase_items pi
      join public.purchases p on p.id = pi.purchase_id
      where pi.presentation_id = pp.id
      order by p.created_at desc, p.id desc, pi.created_at desc, pi.id desc
      limit 1
    ) latest on true
    where pp.cost is distinct from latest.unit_cost
  ) then
    raise exception 'PETSTOCK_LAST_PURCHASE_COST_MISMATCH';
  end if;
  if exists (
    select 1
    from public.sales s
    left join public.sale_items si on si.sale_id = s.id
    group by s.id
    having s.total_amount is distinct from coalesce(sum(si.subtotal), 0)
        or s.total_cost is distinct from coalesce(sum(si.cost), 0)
  ) then
    raise exception 'PETSTOCK_SALE_TOTAL_MISMATCH';
  end if;
end $$;

select jsonb_build_object(
  'status', 'ready',
  'products', (select count(*) from public.products),
  'presentations', (select count(*) from public.product_presentations),
  'active_presentations', (select count(*) from public.product_presentations where status = 'active'),
  'inactive_presentations', (select count(*) from public.product_presentations where status = 'inactive'),
  'sales', (select count(*) from public.sales),
  'purchases', (select count(*) from public.purchases),
  'movements', (select count(*) from public.inventory_movements),
  'long_transactions', (
    select count(*) from pg_stat_activity
    where pid <> pg_backend_pid() and xact_start is not null
      and clock_timestamp() - xact_start > interval '5 minutes'
  )
);

rollback;
