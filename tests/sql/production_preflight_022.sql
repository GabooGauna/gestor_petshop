\set ON_ERROR_STOP on

-- Read-only compatibility gate for the real schema after 020/021 and before 022.
begin read only;

do $$
declare
  v_migration_020 boolean;
  v_migration_021 boolean;
  v_migration_022 boolean := false;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    if current_setting('petstock.environment', true) is distinct from 'e2e' then
      raise exception 'PETSTOCK_MIGRATION_HISTORY_REQUIRED';
    end if;
    v_migration_020 := true;
    v_migration_021 := true;
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
      where name = 'logical_presentation_lifecycle'
    ) into v_migration_022;
  end if;

  if not v_migration_020 or not v_migration_021 then
    raise exception 'PETSTOCK_020_021_REQUIRED';
  end if;
  if v_migration_022
    or exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='product_presentations' and column_name='status'
    )
    or to_regprocedure('public.archive_presentation(uuid)') is not null
    or to_regprocedure('public.reactivate_presentation(uuid)') is not null
  then
    raise exception 'PETSTOCK_022_ALREADY_PRESENT_OR_PARTIAL';
  end if;

  if to_regprocedure('public.process_sale(text,jsonb)') is null
     or to_regprocedure('public.process_purchase(uuid,text,jsonb)') is null
     or to_regprocedure('public.record_shrinkage(uuid,numeric,text)') is null
     or to_regprocedure('public.record_stock_adjustment(uuid,numeric,text)') is null
     or to_regprocedure('public.get_dashboard_analytics(date,date)') is null
     or to_regprocedure('public.get_profitability_detail_report(date,date)') is null
     or to_regprocedure('public.get_inventory_movement_report(date,date,text,uuid,integer,integer)') is null
  then
    raise exception 'PETSTOCK_022_REQUIRED_FUNCTION_MISSING';
  end if;

  if not exists (
      select 1 from pg_trigger
      where tgrelid='public.sale_items'::regclass
        and tgname='sale_items_capture_cost_snapshot' and not tgisinternal
    )
    or not exists (
      select 1 from pg_trigger
      where tgrelid='public.sale_items'::regclass
        and tgname='sale_items_protect_cost_snapshot' and not tgisinternal
    )
    or not exists (
      select 1 from pg_trigger
      where tgrelid='public.product_presentations'::regclass
        and tgname='presentations_require_active_product_on_update' and not tgisinternal
    )
  then
    raise exception 'PETSTOCK_020_021_TRIGGER_MISSING';
  end if;

  if has_function_privilege('anon','public.process_sale(text,jsonb)','EXECUTE')
     or has_function_privilege('anon','public.process_purchase(uuid,text,jsonb)','EXECUTE')
     or not has_function_privilege('authenticated','public.process_sale(text,jsonb)','EXECUTE')
     or not has_function_privilege('authenticated','public.process_purchase(uuid,text,jsonb)','EXECUTE')
     or has_column_privilege('authenticated','public.product_presentations','cost','UPDATE')
     or has_column_privilege('authenticated','public.product_presentations','stock','UPDATE')
     or has_column_privilege('authenticated','public.product_presentations','product_id','UPDATE')
  then
    raise exception 'PETSTOCK_020_021_PRIVILEGE_MISMATCH';
  end if;
end $$;

do $$
begin
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
      join public.purchases p on p.id=pi.purchase_id
      where pi.presentation_id=pp.id
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
    left join public.sale_items si on si.sale_id=s.id
    group by s.id
    having s.total_amount is distinct from coalesce(sum(si.subtotal),0)
        or s.total_cost is distinct from coalesce(sum(si.cost),0)
  ) then
    raise exception 'PETSTOCK_SALE_TOTAL_MISMATCH';
  end if;
end $$;

select jsonb_build_object(
  'status','ready',
  'presentations',(select count(*) from public.product_presentations),
  'sales',(select count(*) from public.sales),
  'purchases',(select count(*) from public.purchases),
  'movements',(select count(*) from public.inventory_movements),
  'long_transactions',(select count(*) from pg_stat_activity where pid<>pg_backend_pid() and xact_start is not null and clock_timestamp()-xact_start>interval '5 minutes')
);

rollback;
