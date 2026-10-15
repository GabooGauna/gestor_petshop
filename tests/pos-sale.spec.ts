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
  const presentationSelect = page.getByLabel('Presentación');
  const optionValue = await presentationSelect.locator('option').filter({ hasText: presentation }).getAttribute('value');
  expect(optionValue).not.toBeNull();
  await presentationSelect.selectOption(optionValue!);
}

test.describe('POS — cuatro modalidades y medios de pago (backend simulado)', () => {
  test.beforeEach(async ({ page }) => openPos(page));

  test('expone las cuatro modalidades y los seis medios de pago', async ({ page }) => {
    for (const mode of ['Por unidad', 'Por peso', 'Por importe', 'Bolsa completa']) await expect(page.getByRole('button', { name: mode })).toBeVisible();
    await expect(page.getByLabel('Medio de pago').locator('option')).toHaveText(['Efectivo', 'Transferencia', 'Débito', 'Crédito', 'Mercado Pago', 'Otro']);
    await expect(page.getByText('La pantalla muestra estimaciones; el servidor confirma importes, costos y stock definitivos.')).toBeVisible();
  });

  test('muestra un ejemplo acorde a cada modalidad', async ({ page }) => {
    await selectProduct(page, 'Alimento QA', 'Bolsa 20 kg');
    await expect(page.getByTestId('pos-input-value')).toHaveAttribute('placeholder', 'Ej.: $ 3.000');
    await page.getByRole('button', { name: 'Por peso' }).click();
    await expect(page.getByTestId('pos-input-value')).toHaveAttribute('placeholder', 'Ej.: 2,500 kg');
    await page.getByRole('button', { name: 'Bolsa completa' }).click();
    await expect(page.getByTestId('pos-input-value')).toHaveAttribute('placeholder', 'Ej.: 1 bolsa');
    await selectProduct(page, 'Correa QA', 'Unidad');
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
    await expect(result).toContainText('Vista previa local');
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
    await expect(page.getByTestId('pos-available-stock')).toContainText('15 uds');
    await page.getByTestId('pos-input-value').fill('2');
    const result = page.getByTestId('pos-calculation-result');
    await expect(result).toContainText('2 uds');
    await expect(result).toContainText('$16000.00');
    await expect(result).toContainText('$10000.00');
  });

  test('muestra el stock y bloquea una cantidad de unidades superior a la disponible', async ({ page }) => {
    await selectProduct(page, 'Correa QA', 'Unidad');
    await expect(page.getByLabel('Presentación').locator('option').last()).toContainText('15 uds');
    await page.getByTestId('pos-input-value').fill('16');

    const stockError = page.getByTestId('pos-stock-error');
    await expect(stockError).toContainText('Stock insuficiente');
    await expect(stockError).toContainText('Solicitado: 16 uds');
    await expect(stockError).toContainText('Disponible: 15 uds');
    await expect(page.getByTestId('pos-calculation-result')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Agregar al ticket' })).toBeDisabled();
    await expect(page.getByText('El ticket está vacío')).toBeVisible();
  });

  test('bloquea por importe cuando el peso calculado supera el stock', async ({ page }) => {
    await selectProduct(page, 'Alimento QA', 'Bolsa 20 kg');
    await expect(page.getByTestId('pos-available-stock')).toContainText('200.000 kg');
    await page.getByTestId('pos-input-value').fill('400000');

    await expect(page.getByTestId('pos-stock-error')).toContainText('228.571 kg');
    await expect(page.getByTestId('pos-calculation-result')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Agregar al ticket' })).toBeDisabled();
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
    await expect(page.getByRole('heading', { name: 'Venta cobrada' })).toBeVisible();
    await expect(page.getByText(/Importe definitivo.*\$\s*3\.000,00.*Transferencia.*Confirmado por el servidor/)).toBeVisible();
    await page.getByRole('button', { name: 'Nueva venta' }).click();
    await expect(page.getByText('El ticket está vacío')).toBeVisible();
  });

  test('informa si el stock cambió antes de cobrar el ticket', async ({ page }) => {
    await page.route('**/rest/v1/rpc/process_sale', route => route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'P0001', details: null, hint: null, message: 'INSUFFICIENT_STOCK' }),
    }));
    await selectProduct(page, 'Correa QA', 'Unidad');
    await page.getByTestId('pos-input-value').fill('2');
    await page.getByRole('button', { name: 'Agregar al ticket' }).click();
    await page.getByRole('button', { name: 'Cobrar ticket' }).click();

    await expect(page.getByRole('alert')).toContainText('El stock cambió y ya no alcanza');
    await expect(page.getByTestId('pos-ticket-panel').getByText('Correa QA', { exact: true })).toBeVisible();
  });

  test('actualiza el stock mostrado después de una venta exitosa', async ({ page }) => {
    const product = mockCatalog.products[1];
    const presentation = product.product_presentations[0];
    let saleCompleted = false;
    await page.route('**/rest/v1/products*', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockCatalog.products.map(item => item.id === product.id
        ? { ...item, product_presentations: item.product_presentations.map(candidate => candidate.id === presentation.id ? { ...candidate, stock: saleCompleted ? 1 : candidate.stock } : candidate) }
        : item)),
    }));
    await page.route('**/rest/v1/rpc/process_sale', route => {
      saleCompleted = true;
      return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sale_id: '99999999-9999-4999-8999-999999999999',
        total_amount: '16000.00',
        total_cost: '10000.00',
        items: [{
          sale_item_id: '88888888-8888-4888-8888-888888888888',
          product_id: product.id,
          presentation_id: presentation.id,
          mode: 'unit',
          commercial_quantity: '14',
          stock_quantity: '14',
          unit_price: '8000.00',
          subtotal: '16000.00',
          line_cost: '10000.00',
          replacement_cost_snapshot: '5000.00',
          presentation_weight_snapshot: null,
          cost_basis: 'last_purchase',
          stock_after: '1',
        }],
      }),
    });
    });
    await selectProduct(page, product.name, presentation.name);
    await page.getByTestId('pos-input-value').fill('14');
    await page.getByRole('button', { name: 'Agregar al ticket' }).click();
    await page.getByRole('button', { name: 'Cobrar ticket' }).click();
    await expect(page.getByRole('heading', { name: 'Venta cobrada' })).toBeVisible();
    await page.getByRole('button', { name: 'Nueva venta' }).click();
    await expect(page.getByText('El ticket está vacío')).toBeVisible();

    await selectProduct(page, product.name, presentation.name);
    await expect(page.getByTestId('pos-available-stock')).toContainText('1 uds');
    await page.getByRole('button', { name: 'Inicio' }).click();
    await expect(page.getByTestId(`low-stock-${presentation.id}`)).toContainText('Disponible: 1 uds · Mínimo: 2 uds');
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
