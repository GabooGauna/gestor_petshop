-- Representative rows that must survive 020 + corrective 021 byte-for-value.
create schema if not exists petstock_test;

insert into public.categories(id, name, created_at) values
  ('21000000-0000-4000-8000-000000000001', 'Preservation category', '2026-10-01 10:00:00+00');
insert into public.suppliers(id, name, contact_info, created_at, active) values
  ('21000000-0000-4000-8000-000000000002', 'Preservation supplier', null, '2026-10-01 10:00:00+00', true);
insert into public.products(id, category_id, name, brand, type, status, min_stock, created_at) values
  ('21000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000001',
   'Preservation unit product', 'PetStock', 'unit', 'active', 2, '2026-10-01 10:00:00+00');
insert into public.product_presentations(
  id, product_id, name, weight_kg, cost, price, price_per_kg, stock, created_at
) values (
  '21000000-0000-4000-8000-000000000004', '21000000-0000-4000-8000-000000000003',
  'Preservation presentation', null, 12.00, 20.00, null, 9.000, '2026-10-01 10:00:00+00'
);
insert into public.purchases(id, supplier_id, total_amount, invoice_number, created_at) values
  ('21000000-0000-4000-8000-000000000005', '21000000-0000-4000-8000-000000000002',
   120.00, 'PRESERVE-001', '2026-10-02 10:00:00+00');
insert into public.purchase_items(
  id, purchase_id, product_id, presentation_id, quantity, unit_cost, subtotal, created_at
) values (
  '21000000-0000-4000-8000-000000000006', '21000000-0000-4000-8000-000000000005',
  '21000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000004',
  10.000, 12.00, 120.00, '2026-10-02 10:00:00+00'
);
insert into public.sales(id, total_amount, total_cost, payment_method, created_at) values
  ('21000000-0000-4000-8000-000000000007', 20.00, 12.00, 'efectivo', '2026-10-03 10:00:00+00');
insert into public.sale_items(
  id, sale_id, product_id, presentation_id, quantity, unit_price, subtotal, cost,
  created_at, sale_mode, commercial_quantity
) values (
  '21000000-0000-4000-8000-000000000008', '21000000-0000-4000-8000-000000000007',
  '21000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000004',
  1.000, 20.00, 20.00, 12.00, '2026-10-03 10:00:00+00', 'unit', 1.000
);
insert into public.inventory_movements(
  id, product_id, presentation_id, type, quantity, reason, created_at,
  reference_type, reference_id
) values
  ('21000000-0000-4000-8000-000000000009', '21000000-0000-4000-8000-000000000003',
   '21000000-0000-4000-8000-000000000004', 'compra', 10.000, 'Preservation purchase',
   '2026-10-02 10:00:00+00', 'purchase', '21000000-0000-4000-8000-000000000005'),
  ('21000000-0000-4000-8000-000000000010', '21000000-0000-4000-8000-000000000003',
   '21000000-0000-4000-8000-000000000004', 'venta', -1.000, 'Preservation sale',
   '2026-10-03 10:00:00+00', 'sale', '21000000-0000-4000-8000-000000000007');
