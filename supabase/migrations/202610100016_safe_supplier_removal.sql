begin;

alter table public.suppliers
  add column if not exists active boolean not null default true;

create index if not exists suppliers_active_name_idx
  on public.suppliers (active, name);

create or replace function public.ensure_purchase_supplier_active()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.supplier_id is not null and not exists (
    select 1
    from public.suppliers
    where id = new.supplier_id and active
  ) then
    raise exception using errcode = 'P0001', message = 'SUPPLIER_NOT_FOUND';
  end if;
  return new;
end;
$$;

drop trigger if exists purchases_require_active_supplier on public.purchases;
create trigger purchases_require_active_supplier
before insert or update of supplier_id on public.purchases
for each row execute function public.ensure_purchase_supplier_active();

create or replace function public.remove_supplier(p_supplier_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_has_purchases boolean;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'AUTHENTICATION_REQUIRED';
  end if;

  select name into v_name
  from public.suppliers
  where id = p_supplier_id and active
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'SUPPLIER_NOT_FOUND';
  end if;

  select exists (
    select 1 from public.purchases where supplier_id = p_supplier_id
  ) into v_has_purchases;

  if v_has_purchases then
    update public.suppliers
    set active = false
    where id = p_supplier_id;
  else
    delete from public.suppliers
    where id = p_supplier_id;
  end if;

  return jsonb_build_object(
    'supplier_id', p_supplier_id,
    'name', v_name,
    'deleted', not v_has_purchases,
    'archived', v_has_purchases
  );
end;
$$;

revoke all on function public.remove_supplier(uuid) from public, anon;
revoke all on function public.ensure_purchase_supplier_active() from public, anon, authenticated;
grant execute on function public.remove_supplier(uuid) to authenticated;

commit;
