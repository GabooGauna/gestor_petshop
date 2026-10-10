import { expect, test, type Page } from '@playwright/test';
import { installMockBackend, loginWithMockUser, mockCatalog } from './support/e2e';

async function openPos(page: Page): Promise<void> {
  await installMockBackend(page);
  await loginWithMockUser(page);
  await page.getByRole('button', { name: 'Punto de Venta', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Punto de venta' })).toBeVisible();
}

async function selectProduct(page: Page, product: string, presentation: string): Promise<void> {
  await page.getByLabel('Producto').selectOption({ label: product });
  await page.getByLabel('Presentación').selectOption({ label: presentation });
}

test.describe('POS — cuatro modalidades y medios de pago (backend simulado)', () => {
  test.beforeEach(async ({ page }) => openPos(page));

  test('expone las cuatro modalidades y los seis medios de pago', async ({ page }) => {
    for (const mode of ['Por unidad', 'Por peso', 'Por importe', 'Bolsa completa']) await expect(page.getByRole('button', { name: mode })).toBeVisible();
    await expect(page.getByLabel('Medio de pago').locator('option')).toHaveText(['Efectivo', 'Transferencia', 'Débito', 'Crédito', 'Mercado Pago', 'Otro']);
  });

  test('muestra un ejemplo acorde a cada modalidad', async ({ page }) => {
    await selectProduct(page, 'Alimento QA', 'Bolsa 20 kg');
    await expect(page.getByTestId('pos-input-value')).toHaveAttribute('placeholder', 'Ej.: $ 3.000');
    await page.getByRole('button', { name: 'Por peso' }).click();
    await expect(page.getByTestId('pos-input-value')).toHaveAttribute('placeholder', 'Ej.: 2,500 kg');
    await page.getByRole('button', { name: 'Bolsa completa' }).click();
    await expect(page.getByTestId('pos-input-value')).toHaveAttribute('placeholder', 'Ej.: 1 bolsa');
    await page.getByLabel('Producto').selectOption({ label: 'Correa QA' });
    await page.getByLabel('Presentación').selectOption({ label: 'Unidad' });
    await expect(page.getByTestId('pos-input-value')).toHaveAttribute('placeholder', 'Ej.: 1 unidad');
  });

  test('por importe: $3.000 calcula 1,714 kg y costo histórico correcto', async ({ page }) => {
    await selectProduct(page, 'Alimento QA', 'Bolsa 20 kg');
    await page.getByRole('button', { name: 'Por importe' }).click();
    await page.getByTestId('pos-input-value').fill('3000');
    const result = page.getByTestId('pos-calculation-result');
    await expect(result).toContainText('1.714 kg');
    await expect(result).toContainText('$3000.00');
    await expect(result).toContainText('$2142.50');
  });

  test('por peso: 2,500 kg calcula $4.375 y costo $3.125', async ({ page }) => {
    await selectProduct(page, 'Alimento QA', 'Bolsa 20 kg');
    await page.getByRole('button', { name: 'Por peso' }).click();
    await page.getByTestId('pos-input-value').fill('2.5');
    const result = page.getByTestId('pos-calculation-result');
    await expect(result).toContainText('2.500 kg');
    await expect(result).toContainText('$4375.00');
    await expect(result).toContainText('$3125.00');
  });

  test('bolsa completa: una bolsa descuenta 20 kg y cobra $35.000', async ({ page }) => {
    await selectProduct(page, 'Alimento QA', 'Bolsa 20 kg');
    await page.getByRole('button', { name: 'Bolsa completa' }).click();
    await page.getByTestId('pos-input-value').fill('1');
    const result = page.getByTestId('pos-calculation-result');
    await expect(result).toContainText('20.000 kg');
    await expect(result).toContainText('$35000.00');
    await expect(result).toContainText('$25000.00');
  });

  test('por unidad: dos unidades descuentan 2 y cobran $16.000', async ({ page }) => {
    await selectProduct(page, 'Correa QA', 'Unidad');
    await page.getByTestId('pos-input-value').fill('2');
    const result = page.getByTestId('pos-calculation-result');
    await expect(result).toContainText('2 u');
    await expect(result).toContainText('$16000.00');
    await expect(result).toContainText('$10000.00');
  });

  test('envía al RPC solo modalidad, entrada y pago; no totales del cliente', async ({ page }) => {
    let rpcBody: unknown;
    await page.route('**/rest/v1/rpc/process_sale', async route => {
      rpcBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sale_id: '99999999-9999-4999-8999-999999999999', total_amount: '3000.00', total_cost: '2142.50', items: [] }) });
    });
    await selectProduct(page, 'Alimento QA', 'Bolsa 20 kg');
    await page.getByTestId('pos-input-value').fill('3000');
    await page.getByRole('button', { name: 'Agregar al ticket' }).click();
    await page.getByLabel('Medio de pago').selectOption('transferencia');
    await page.getByRole('button', { name: 'Cobrar ticket' }).click();
    await expect.poll(() => rpcBody).toBeTruthy();
    expect(rpcBody).toEqual({ p_payment_method: 'transferencia', p_items: [{ presentation_id: mockCatalog.products[0].product_presentations[0].id, mode: 'amount', amount: '3000.00' }] });
  });

  test('rechaza exceso de decimales y fracciones en unidad/bolsa', async ({ page }) => {
    await selectProduct(page, 'Alimento QA', 'Bolsa 20 kg');
    await page.getByRole('button', { name: 'Por peso' }).click();
    await page.getByTestId('pos-input-value').fill('1.2345');
    await page.getByRole('button', { name: 'Agregar al ticket' }).click();
    await expect(page.getByRole('alert')).toContainText('hasta 3 decimales');
    await page.getByRole('button', { name: 'Bolsa completa' }).click();
    await page.getByTestId('pos-input-value').fill('1.5');
    await page.getByRole('button', { name: 'Agregar al ticket' }).click();
    await expect(page.getByRole('alert')).toContainText('entero positivo');
  });
});
