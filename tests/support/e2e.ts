import { expect, type Page, type TestInfo } from '@playwright/test';

export const E2E_EMAIL = process.env.E2E_EMAIL?.trim() ?? '';
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? '';

export function skipUnlessRealAuth(testInfo: TestInfo): void {
  testInfo.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Requiere E2E_EMAIL y E2E_PASSWORD de un usuario Auth dedicado.');
}

export function skipUnlessIsolated(testInfo: TestInfo): void {
  const confirmed = process.env.E2E_ISOLATED === 'true'
    && process.env.E2E_MUTATIONS === 'isolated-only'
    && Boolean(process.env.E2E_RUN_ID?.trim());
  testInfo.skip(!confirmed, 'Prueba mutante bloqueada: requiere E2E_ISOLATED=true, E2E_MUTATIONS=isolated-only y E2E_RUN_ID.');
  skipUnlessRealAuth(testInfo);
}

export async function loginWithE2EUser(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Correo').fill(E2E_EMAIL);
  await page.getByLabel('Contraseña').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'El pulso de Avenida Animal' })).toBeVisible();
}

const nowSeconds = Math.floor(Date.now() / 1000);
const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');
const mockAccessToken = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
  aud: 'authenticated',
  exp: nowSeconds + 3600,
  iat: nowSeconds,
  role: 'authenticated',
  sub: '11111111-1111-4111-8111-111111111111',
  email: 'qa@petstock.test',
})}.signature`;

export const mockCatalog = {
  categories: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'QA', created_at: null }],
  suppliers: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Proveedor QA', contact_info: null, created_at: null, active: true }],
  products: [
    {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Alimento QA', brand: 'QA',
      category_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', created_at: null,
      min_stock: 10, status: 'active', type: 'weight',
      product_presentations: [{
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', product_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        name: 'Bolsa 20 kg', weight_kg: 20, cost: 25000, price: 35000,
        price_per_kg: 1750, stock: 200, created_at: null,
      }],
    },
    {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', name: 'Correa QA', brand: 'QA',
      category_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', created_at: null,
      min_stock: 2, status: 'active', type: 'unit',
      product_presentations: [{
        id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', product_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        name: 'Unidad', weight_kg: null, cost: 5000, price: 8000,
        price_per_kg: null, stock: 15, created_at: null,
      }],
    },
  ],
} as const;

const mockDashboard = {
  timezone: 'America/Argentina/Buenos_Aires',
  period: { from: '2026-10-04', to: '2026-10-10' },
  today: {
    sales_count: 3, total_amount: '245000.00', total_cost: '168000.00',
    gross_profit: '77000.00', margin_pct: '31.43', sales_change_pct: '18.50',
  },
  selected_period: {
    sales_count: 18, total_amount: '1085000.00', total_cost: '752000.00',
    gross_profit: '333000.00', margin_pct: '30.69', sales_change_pct: '12.40',
    profit_change_pct: '15.20',
  },
  daily_sales: [
    ['2026-10-04', 2, '95000.00', '68000.00', '27000.00', '28.42'],
    ['2026-10-05', 3, '138000.00', '96000.00', '42000.00', '30.43'],
    ['2026-10-06', 2, '112000.00', '79000.00', '33000.00', '29.46'],
    ['2026-10-07', 4, '210000.00', '142000.00', '68000.00', '32.38'],
    ['2026-10-08', 1, '78000.00', '55000.00', '23000.00', '29.49'],
    ['2026-10-09', 3, '207000.00', '144000.00', '63000.00', '30.43'],
    ['2026-10-10', 3, '245000.00', '168000.00', '77000.00', '31.43'],
  ].map(([date, sales_count, sales, total_cost, gross_profit, margin_pct]) => ({
    date, sales_count, sales, total_cost, gross_profit, margin_pct,
  })),
  low_stock: [],
  recent_sales: [],
  recent_purchases: [],
};

export const mockProfitability = [{
  product_id: mockCatalog.products[0].id,
  product_name: mockCatalog.products[0].name,
  product_type: 'weight',
  unit: 'kg',
  sales_count: 4,
  stock_quantity: '12.500',
  total_amount: '245000.00',
  total_cost: '168000.00',
  gross_profit: '77000.00',
  margin_pct: '31.43',
}] as const;

export const mockProfitabilityDetail = [{
  sale_id: '13131313-1313-4131-8131-131313131313',
  sale_item_id: '17171717-1717-4171-8171-171717171717',
  sale_date: '2026-10-10T13:30:00Z',
  product_id: mockCatalog.products[0].id,
  product_name: mockCatalog.products[0].name,
  presentation_name: mockCatalog.products[0].product_presentations[0].name,
  product_type: 'weight',
  unit: 'kg',
  payment_method: 'efectivo',
  stock_quantity: '12.500',
  total_amount: '245000.00',
  total_cost: '168000.00',
  gross_profit: '77000.00',
  margin_pct: '31.43',
}, {
  sale_id: '18181818-1818-4181-8181-181818181818',
  sale_item_id: '19191919-1919-4191-8191-191919191919',
  sale_date: '2026-10-09T16:15:00Z',
  product_id: mockCatalog.products[1].id,
  product_name: mockCatalog.products[1].name,
  presentation_name: mockCatalog.products[1].product_presentations[0].name,
  product_type: 'unit',
  unit: 'uds',
  payment_method: 'transferencia',
  stock_quantity: '2.000',
  total_amount: '17600.00',
  total_cost: '16000.00',
  gross_profit: '1600.00',
  margin_pct: '9.09',
}] as const;

const mockPaymentMethods = [
  ['efectivo', 2, '120000.00', '48.98'],
  ['transferencia', 1, '75000.00', '30.61'],
  ['debito', 1, '50000.00', '20.41'],
  ['credito', 0, '0.00', '0.00'],
  ['mercado_pago', 0, '0.00', '0.00'],
  ['otro', 0, '0.00', '0.00'],
].map(([payment_method, sales_count, total_amount, share_pct]) => ({
  payment_method, sales_count, total_amount, share_pct,
}));

const mockReportMovements = [
  {
    id: '12121212-1212-4121-8121-121212121212',
    created_at: '2026-10-10T13:00:00Z',
    type: 'venta',
    product_id: mockCatalog.products[0].id,
    product_name: mockCatalog.products[0].name,
    presentation_id: mockCatalog.products[0].product_presentations[0].id,
    presentation_name: mockCatalog.products[0].product_presentations[0].name,
    quantity: '-2.500',
    unit: 'kg',
    reason: 'Venta 13131313-1313-4131-8131-131313131313',
    reference_type: 'sale',
    reference_id: '13131313-1313-4131-8131-131313131313',
  },
  {
    id: '14141414-1414-4141-8141-141414141414',
    created_at: '2026-10-10T14:00:00Z',
    type: 'venta',
    product_id: mockCatalog.products[1].id,
    product_name: mockCatalog.products[1].name,
    presentation_id: mockCatalog.products[1].product_presentations[0].id,
    presentation_name: mockCatalog.products[1].product_presentations[0].name,
    quantity: '-1.000',
    unit: 'uds',
    reason: 'Venta unitaria QA',
    reference_type: 'sale',
    reference_id: '15151515-1515-4151-8151-151515151515',
  },
];

export async function installMockBackend(page: Page): Promise<void> {
  const user = {
    id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated',
    email: 'qa@petstock.test', app_metadata: {}, user_metadata: {},
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  await page.route('**/auth/v1/token?grant_type=password', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      access_token: mockAccessToken, token_type: 'bearer', expires_in: 3600,
      expires_at: nowSeconds + 3600, refresh_token: 'mock-refresh-token', user,
    }),
  }));
  await page.route('**/auth/v1/user', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) }));
  await page.route('**/rest/v1/categories*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCatalog.categories) }));
  await page.route('**/rest/v1/suppliers*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCatalog.suppliers) }));
  await page.route('**/rest/v1/products*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCatalog.products) }));
  await page.route('**/rest/v1/inventory_movements*', route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Content-Range': '0-0/0' }, body: '[]' }));
  await page.route('**/rest/v1/rpc/get_dashboard_analytics', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDashboard) }));
  await page.route('**/rest/v1/rpc/get_product_profitability_report', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockProfitability) }));
  await page.route('**/rest/v1/rpc/get_profitability_detail_report', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockProfitabilityDetail) }));
  await page.route('**/rest/v1/rpc/get_payment_method_report', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockPaymentMethods) }));
  await page.route('**/rest/v1/rpc/get_inventory_movement_report', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_count: mockReportMovements.length, items: mockReportMovements }) }));
  await page.route('**/rest/v1/rpc/create_product_with_presentation', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    id: '14141414-1414-4141-8141-141414141414', name: 'Producto creado', brand: null,
    category_id: mockCatalog.categories[0].id, type: 'unit', min_stock: '0.000', status: 'active',
    created_at: '2026-10-10T13:00:00Z', presentation_id: '15151515-1515-4151-8151-151515151515',
  }) }));
  await page.route('**/rest/v1/rpc/create_product_presentation', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    id: '16161616-1616-4161-8161-161616161616', product_id: mockCatalog.products[1].id,
    name: 'Correa larga', weight_kg: null, cost: '8000.00', price: '8800.00',
    price_per_kg: null, stock: '6.000', created_at: '2026-10-10T13:00:00Z',
  }) }));
}

export async function loginWithMockUser(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Correo').fill('qa@petstock.test');
  await page.getByLabel('Contraseña').fill('not-sent-anywhere');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'El pulso de Avenida Animal' })).toBeVisible();
}
