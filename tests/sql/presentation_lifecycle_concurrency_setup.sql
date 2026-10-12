\set ON_ERROR_STOP on

do $$
begin
  if current_setting('petstock.environment', true) is distinct from 'e2e'
     or current_database() !~ '^petstock_(e2e|test)_[a-z0-9_]+$' then
    raise exception 'PETSTOCK_DISPOSABLE_DATABASE_REQUIRED';
  end if;
end $$;

insert into public.categories(id, name)
values ('70000000-0000-4000-8000-000000000001', 'Presentation race category');
insert into public.suppliers(id, name)
values ('70000000-0000-4000-8000-000000000002', 'Presentation race supplier');
insert into public.products(id, name, category_id, type, status, min_stock)
select id, name, '70000000-0000-4000-8000-000000000001', 'unit', 'active', 0
from (values
  ('70000000-0000-4000-8000-000000000003'::uuid, 'Archive beats sale'),
  ('70000000-0000-4000-8000-000000000004'::uuid, 'Archive beats purchase'),
  ('70000000-0000-4000-8000-000000000005'::uuid, 'Archive beats adjustment'),
  ('70000000-0000-4000-8000-000000000006'::uuid, 'Archive beats shrinkage'),
  ('70000000-0000-4000-8000-000000000007'::uuid, 'Sale beats archive')
) fixture(id, name);
insert into public.product_presentations(id, product_id, name, cost, price, stock)
values
  ('70000000-0000-4000-8000-000000000013', '70000000-0000-4000-8000-000000000003', 'Sale race', 10, 20, 2),
  ('70000000-0000-4000-8000-000000000014', '70000000-0000-4000-8000-000000000004', 'Purchase race', 10, 20, 0),
  ('70000000-0000-4000-8000-000000000015', '70000000-0000-4000-8000-000000000005', 'Adjustment race', 10, 20, 2),
  ('70000000-0000-4000-8000-000000000016', '70000000-0000-4000-8000-000000000006', 'Shrinkage race', 10, 20, 2),
  ('70000000-0000-4000-8000-000000000017', '70000000-0000-4000-8000-000000000007', 'Sale winner race', 10, 20, 2);
insert into public.inventory_movements(product_id, presentation_id, type, quantity, reason, reference_type, reference_id)
select product_id, id, 'ajuste', stock, 'Presentation race opening', 'opening_balance', id
from public.product_presentations
where id in (
  '70000000-0000-4000-8000-000000000013',
  '70000000-0000-4000-8000-000000000015',
  '70000000-0000-4000-8000-000000000016',
  '70000000-0000-4000-8000-000000000017'
);

create or replace function petstock_test.delay_presentation_archive()
returns trigger language plpgsql as $$
begin
  if new.id in (
       '70000000-0000-4000-8000-000000000013',
       '70000000-0000-4000-8000-000000000014',
       '70000000-0000-4000-8000-000000000015',
       '70000000-0000-4000-8000-000000000016'
     ) and new.status = 'inactive'
  then perform pg_sleep(1.5); end if;
  return new;
end $$;
create trigger petstock_test_delay_presentation_archive
before update of status on public.product_presentations
for each row execute function petstock_test.delay_presentation_archive();

create or replace function petstock_test.delay_presentation_sale()
returns trigger language plpgsql as $$
begin
  if current_setting('petstock.test_worker', true) = 'presentation_sale_wins:sale'
  then perform pg_sleep(1.5); end if;
  return new;
end $$;
create trigger petstock_test_delay_presentation_sale
before insert on public.sales
for each row execute function petstock_test.delay_presentation_sale();
