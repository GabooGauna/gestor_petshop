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
  await expect(page.getByRole('heading', { name: 'Estado del stock' })).toBeVisible();
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
  suppliers: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Proveedor QA', contact_info: null, created_at: null }],
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
  await page.route('**/rest/v1/inventory_movements*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
}

export async function loginWithMockUser(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Correo').fill('qa@petstock.test');
  await page.getByLabel('Contraseña').fill('not-sent-anywhere');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Estado del stock' })).toBeVisible();
}
