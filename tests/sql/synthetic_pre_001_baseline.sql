-- TEST FIXTURE ONLY. NOT A CANONICAL BASELINE. NOT FOR PRODUCTION MIGRATION.
--
-- Minimal pre-001 schema reconstructed from database.types.ts and the direct
-- dependencies of migrations 001-017. The seed rows below exist exclusively
-- because migration 003 asserts a captured production snapshot by UUID/value.
-- They contain invented labels and no production identity, credential or secret.

\set ON_ERROR_STOP on

do $$
begin
  if current_setting('petstock.environment', true) is distinct from 'e2e'
     or current_database() !~ '^petstock_(e2e|test)_[a-z0-9_]+$' then
    raise exception 'PETSTOCK_DISPOSABLE_DATABASE_REQUIRED';
  end if;
  if to_regprocedure('auth.uid()') is null
     or not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'PETSTOCK_SUPABASE_RUNTIME_REQUIRED';
  end if;
end $$;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_info text,
  created_at timestamptz default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  category_id uuid references public.categories(id) on delete set null,
  type text,
  min_stock numeric(10,3) default 0,
  status text default 'active',
  created_at timestamptz default now()
);

create table public.product_presentations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  name text not null,
  weight_kg numeric(10,3),
  cost numeric(12,2) not null default 0,
  price numeric(12,2) not null default 0,
  price_per_kg numeric(12,2),
  stock numeric(10,3) not null default 0,
  created_at timestamptz default now()
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  total_amount numeric(12,2) not null,
  total_cost numeric(12,2) not null,
  payment_method text,
  created_at timestamptz default now()
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references public.sales(id) on delete cascade,
  product_id uuid references public.products(id),
  presentation_id uuid references public.product_presentations(id),
  quantity numeric(10,3) not null,
  unit_price numeric(12,2) not null,
  subtotal numeric(12,2) not null,
  cost numeric(12,2) not null,
  created_at timestamptz default now()
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers(id) on delete set null,
  invoice_number text,
  total_amount numeric(12,2) not null,
  created_at timestamptz default now()
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid references public.purchases(id) on delete cascade,
  product_id uuid references public.products(id),
  presentation_id uuid references public.product_presentations(id),
  quantity numeric(10,3) not null,
  unit_cost numeric(12,2) not null,
  subtotal numeric(12,2) not null,
  created_at timestamptz default now()
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id),
  presentation_id uuid references public.product_presentations(id),
  type text not null,
  quantity numeric(10,3) not null,
  reason text,
  created_at timestamptz default now()
);

insert into public.categories(id,name) values
  ('30000000-0000-4000-8000-000000000001','Synthetic migration fixture');

insert into public.products(id,name,category_id,type,status,min_stock) values
  ('d4ba6093-4582-47a0-9bd8-0d31e1c13566','Synthetic 001','30000000-0000-4000-8000-000000000001','weight','active',0),
  ('2530703e-4316-45bd-983d-283890c34aa7','Synthetic 002','30000000-0000-4000-8000-000000000001','weight','active',0),
  ('90596379-4220-423c-b0d8-4ac26c5e8907','Synthetic 003','30000000-0000-4000-8000-000000000001','weight','active',0),
  ('c6e144ba-7884-48f6-a9b3-8349eebda30a','Synthetic 004','30000000-0000-4000-8000-000000000001','weight','active',0),
  ('75e26183-199d-4afa-ba72-84a03bd56026','Synthetic 005','30000000-0000-4000-8000-000000000001','weight','active',0),
  ('0b028111-81e4-41ac-be35-39425d4de2d3','Synthetic 006','30000000-0000-4000-8000-000000000001','weight','active',0),
  ('71b85aa1-6aef-4ae8-aa0a-23b4c936de6b','Synthetic 007','30000000-0000-4000-8000-000000000001','weight','active',0),
  ('d70d8ac5-f241-4917-ae45-e97b8526dab6','Synthetic 008','30000000-0000-4000-8000-000000000001','weight','active',0),
  ('30000000-0000-4000-8000-000000000002','Synthetic sale product','30000000-0000-4000-8000-000000000001','weight','active',0);

insert into public.product_presentations(id,product_id,name,weight_kg,cost,price,price_per_kg,stock) values
  ('322ae52a-3533-417f-9bef-56661f4d2fbc','d4ba6093-4582-47a0-9bd8-0d31e1c13566','Synthetic bag',20,25000,33000,1650,20),
  ('3c7456e8-3047-4004-ad41-46b3777a83fa','2530703e-4316-45bd-983d-283890c34aa7','Synthetic bag',20,25000,33000,1650,20),
  ('7be784ef-fcc4-400e-8766-6f4d3c15d54a','90596379-4220-423c-b0d8-4ac26c5e8907','Synthetic bag',20,25000,33000,1650,20),
  ('8e956ee6-994b-4176-b7ee-2aa2527d2b40','c6e144ba-7884-48f6-a9b3-8349eebda30a','Synthetic bag',20,25000,33000,1650,20),
  ('9d4b1854-c5e5-4cf2-81ec-519685fd1482','75e26183-199d-4afa-ba72-84a03bd56026','Synthetic bag',20,25000,33000,1650,90),
  ('ad7297ff-24ee-48c7-8003-c004cfa45e7e','0b028111-81e4-41ac-be35-39425d4de2d3','Synthetic bag',20,25000,33000,1650,20),
  ('bd908f80-7346-41ab-802a-535be48360ca','71b85aa1-6aef-4ae8-aa0a-23b4c936de6b','Synthetic bag',20,25000,33000,1650,20),
  ('f435be60-7f71-4e23-a671-21effa4b24d1','d70d8ac5-f241-4917-ae45-e97b8526dab6','Synthetic bag',20,25000,33000,1650,20),
  ('89cef8d0-3534-4f6b-bb6c-28a04a6f706d','30000000-0000-4000-8000-000000000002','Synthetic historical bag',20,25000,33000,1650,0);

insert into public.inventory_movements(product_id,presentation_id,type,quantity,reason,created_at) values
  ('75e26183-199d-4afa-ba72-84a03bd56026','9d4b1854-c5e5-4cf2-81ec-519685fd1482','compra',30,'Synthetic snapshot prerequisite','2026-10-09T15:00:00Z');

insert into public.sales(id,total_amount,total_cost,payment_method,created_at) values
  ('8ec90971-e4a6-456a-97a9-ad90e8edb94a',3000,45450,'Efectivo','2026-10-09T15:00:00Z');
insert into public.sale_items(id,sale_id,product_id,presentation_id,quantity,unit_price,subtotal,cost,created_at) values
  ('16794946-1d61-44f3-856d-db7ced05de02','8ec90971-e4a6-456a-97a9-ad90e8edb94a',
   '30000000-0000-4000-8000-000000000002','89cef8d0-3534-4f6b-bb6c-28a04a6f706d',
   1.818,1650,3000,25000,'2026-10-09T15:00:00Z');

comment on schema public is
  'Synthetic PetStock pre-001 test fixture; not a canonical or production baseline.';
