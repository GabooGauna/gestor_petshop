\set ON_ERROR_STOP on

do $$ begin
  if current_setting('petstock.environment', true) is distinct from 'e2e'
     or current_database() !~ '^petstock_(e2e|test)_[a-z0-9_]+$' then
    raise exception 'PETSTOCK_DISPOSABLE_DATABASE_REQUIRED';
  end if;
end $$;

create schema if not exists petstock_test;
create table if not exists petstock_test.outcomes (
  scenario text not null, worker text not null, outcome text not null,
  actor text not null default current_user,
  duration_ms numeric not null,
  before_rows bigint,
  after_rows bigint,
  primary key (scenario, worker)
);
alter table petstock_test.outcomes add column if not exists before_rows bigint;
alter table petstock_test.outcomes add column if not exists after_rows bigint;
truncate petstock_test.outcomes;
grant usage on schema petstock_test to authenticated;
grant select, insert on petstock_test.outcomes to authenticated;

do $$
declare v_sales uuid[]; v_purchases uuid[];
begin
  select array_agg(distinct sale_id) into v_sales from public.sale_items
  where product_id::text like '20000000-0000-4000-8000-00000000000%';
  select array_agg(distinct purchase_id) into v_purchases from public.purchase_items
  where product_id::text like '20000000-0000-4000-8000-00000000000%';
  delete from public.inventory_movements where product_id::text like '20000000-0000-4000-8000-00000000000%';
  delete from public.sale_items where product_id::text like '20000000-0000-4000-8000-00000000000%';
  delete from public.purchase_items where product_id::text like '20000000-0000-4000-8000-00000000000%';
  delete from public.sales where id = any(coalesce(v_sales, array[]::uuid[]));
  delete from public.purchases where id = any(coalesce(v_purchases, array[]::uuid[]));
  delete from public.product_presentations where product_id::text like '20000000-0000-4000-8000-00000000000%';
  delete from public.products where id::text like '20000000-0000-4000-8000-00000000000%';
  delete from public.suppliers where id = '20000000-0000-4000-8000-000000000010';
  delete from public.categories where id = '20000000-0000-4000-8000-000000000011';
end $$;

insert into public.categories(id,name) values
  ('20000000-0000-4000-8000-000000000011','Concurrency fixtures');
insert into public.suppliers(id,name) values
  ('20000000-0000-4000-8000-000000000010','Concurrency supplier');
insert into public.products(id,name,category_id,type,status,min_stock) values
  ('20000000-0000-4000-8000-000000000001','Sale race','20000000-0000-4000-8000-000000000011','unit','active',0),
  ('20000000-0000-4000-8000-000000000002','Purchase race','20000000-0000-4000-8000-000000000011','unit','active',0),
  ('20000000-0000-4000-8000-000000000003','Archive race','20000000-0000-4000-8000-000000000011','unit','active',0),
  ('20000000-0000-4000-8000-000000000004','Order A','20000000-0000-4000-8000-000000000011','unit','active',0),
  ('20000000-0000-4000-8000-000000000005','Order B','20000000-0000-4000-8000-000000000011','unit','active',0),
  ('20000000-0000-4000-8000-000000000006','Archive sale race','20000000-0000-4000-8000-000000000011','unit','active',0),
  ('20000000-0000-4000-8000-000000000007','Archive purchase race','20000000-0000-4000-8000-000000000011','unit','active',0),
  ('20000000-0000-4000-8000-000000000008','Archive direct update race','20000000-0000-4000-8000-000000000011','unit','active',0),
  ('20000000-0000-4000-8000-000000000009','Archive adjustment race','20000000-0000-4000-8000-000000000011','unit','active',0),
  ('20000000-0000-4000-8000-000000000012','Create wins archive race','20000000-0000-4000-8000-000000000011','unit','active',0),
  ('20000000-0000-4000-8000-000000000013','Archive wins create race','20000000-0000-4000-8000-000000000011','unit','active',0);
insert into public.product_presentations(id,product_id,name,cost,price,stock) values
  ('20000000-0000-4000-8000-000000000021','20000000-0000-4000-8000-000000000001','Unit',10,20,1),
  ('20000000-0000-4000-8000-000000000022','20000000-0000-4000-8000-000000000002','Unit',10,20,0),
  ('20000000-0000-4000-8000-000000000023','20000000-0000-4000-8000-000000000003','Unit',10,20,2),
  ('20000000-0000-4000-8000-000000000024','20000000-0000-4000-8000-000000000004','Unit',10,20,2),
  ('20000000-0000-4000-8000-000000000025','20000000-0000-4000-8000-000000000005','Unit',10,20,2),
  ('20000000-0000-4000-8000-000000000026','20000000-0000-4000-8000-000000000006','Unit',10,20,2),
  ('20000000-0000-4000-8000-000000000027','20000000-0000-4000-8000-000000000007','Unit',10,20,0),
  ('20000000-0000-4000-8000-000000000028','20000000-0000-4000-8000-000000000008','Unit',10,20,2),
  ('20000000-0000-4000-8000-000000000029','20000000-0000-4000-8000-000000000009','Unit',10,20,2);
insert into public.inventory_movements(product_id,presentation_id,type,quantity,reason,reference_type,reference_id)
select product_id,id,'ajuste',stock,'Concurrency opening','opening_balance',id
from public.product_presentations
where id in ('20000000-0000-4000-8000-000000000021','20000000-0000-4000-8000-000000000023',
             '20000000-0000-4000-8000-000000000024','20000000-0000-4000-8000-000000000025',
             '20000000-0000-4000-8000-000000000026','20000000-0000-4000-8000-000000000028',
             '20000000-0000-4000-8000-000000000029');

create or replace function petstock_test.delay_purchase() returns trigger language plpgsql as $$
begin
  if exists(select 1 from public.purchases where id=new.purchase_id and invoice_number='CONCURRENT-PURCHASE')
  then perform pg_sleep(2); end if;
  return new;
end $$;
drop trigger if exists petstock_test_delay_purchase on public.purchase_items;
create trigger petstock_test_delay_purchase before insert on public.purchase_items
for each row execute function petstock_test.delay_purchase();

create or replace function petstock_test.delay_archive() returns trigger language plpgsql as $$
begin
  if new.id in ('20000000-0000-4000-8000-000000000003',
                '20000000-0000-4000-8000-000000000006',
                '20000000-0000-4000-8000-000000000007',
                '20000000-0000-4000-8000-000000000008',
                '20000000-0000-4000-8000-000000000009',
                '20000000-0000-4000-8000-000000000013')
     and new.status='inactive'
  then perform pg_sleep(1.5); end if;
  return new;
end $$;
drop trigger if exists petstock_test_delay_archive on public.products;
create trigger petstock_test_delay_archive before update of status on public.products
for each row execute function petstock_test.delay_archive();

create or replace function petstock_test.delay_sale() returns trigger language plpgsql as $$
begin
  if current_setting('petstock.test_worker', true) in ('sale_sale:a', 'multi_order:ab')
  then perform pg_sleep(1.5); end if;
  return new;
end $$;
drop trigger if exists petstock_test_delay_sale on public.sales;
create trigger petstock_test_delay_sale before insert on public.sales
for each row execute function petstock_test.delay_sale();

create or replace function petstock_test.delay_presentation_create() returns trigger language plpgsql as $$
begin
  if current_setting('petstock.test_worker', true) = 'create_archive:create'
     and new.product_id = '20000000-0000-4000-8000-000000000012'
  then perform pg_sleep(2); end if;
  return new;
end $$;
drop trigger if exists petstock_test_delay_presentation_create on public.product_presentations;
create trigger petstock_test_delay_presentation_create before insert on public.product_presentations
for each row execute function petstock_test.delay_presentation_create();
