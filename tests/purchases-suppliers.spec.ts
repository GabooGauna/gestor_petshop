import { expect, test, type Page } from '@playwright/test';
import { installMockBackend, loginWithMockUser, mockCatalog } from './support/e2e';

async function openPurchases(page: Page): Promise<void> {
  await installMockBackend(page);
  await loginWithMockUser(page);
  await page.getByRole('button', { name: 'Compras' }).click();
  await expect(page.getByRole('heading', { name: 'Registrar Compra' })).toBeVisible();
}

test.describe('Compras v2 (backend simulado)', () => {
  test('prioriza el ancho de producto y presentación en escritorio', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const product = page.getByTestId('purchase-item-product-0');
    await product.selectOption(mockCatalog.products[0].id);
    const presentation = page.getByTestId('purchase-item-presentation-0');

    const productBox = await product.boundingBox();
    const presentationBox = await presentation.boundingBox();
    expect(productBox?.width).toBeGreaterThan(260);
    expect(presentationBox?.width).toBeGreaterThan(245);
  });

  test.beforeEach(async ({ page }) => openPurchases(page));

  test('calcula 10 bolsas × $25.000 = $250.000 sin enviar total manipulable', async ({ page }) => {
    let rpcBody: unknown;
    await page.route('**/rest/v1/rpc/process_purchase', async route => {
      rpcBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        purchase_id: '14141414-1414-4141-8141-141414141414', total_amount: '250000.00',
        items: [{ purchase_item_id: '15151515-1515-4151-8151-151515151515', product_id: mockCatalog.products[0].id, presentation_id: mockCatalog.products[0].product_presentations[0].id, quantity: '10', unit_cost: '25000.00', subtotal: '250000.00', stock_added: '200.000', stock_after: '400.000' }],
      }) });
    });
    await page.getByTestId('purchase-supplier-select').selectOption(mockCatalog.suppliers[0].id);
    await page.getByTestId('purchase-invoice-input').fill('E2E-001');
    await page.getByTestId('purchase-item-product-0').selectOption(mockCatalog.products[0].id);
    await page.getByTestId('purchase-item-presentation-0').selectOption(mockCatalog.products[0].product_presentations[0].id);
    await page.getByTestId('purchase-item-quantity-0').fill('10');
    await page.getByTestId('purchase-item-cost-0').fill('25000');
    await expect(page.getByTestId('purchase-total-amount')).toContainText('250.000,00');
    await page.getByTestId('submit-purchase-btn').click();
    await expect.poll(() => rpcBody).toBeTruthy();
    expect(rpcBody).toEqual({
      p_supplier_id: mockCatalog.suppliers[0].id,
      p_invoice_number: 'E2E-001',
      p_items: [{ presentation_id: mockCatalog.products[0].product_presentations[0].id, quantity: '10', unit_cost: '25000.00' }],
    });
  });

  test('rechaza cantidad fraccionaria, cero y costo con más de dos decimales', async ({ page }) => {
    await page.getByTestId('purchase-supplier-select').selectOption(mockCatalog.suppliers[0].id);
    await page.getByTestId('purchase-item-product-0').selectOption(mockCatalog.products[0].id);
    await page.getByTestId('purchase-item-presentation-0').selectOption(mockCatalog.products[0].product_presentations[0].id);
    await page.getByTestId('purchase-item-quantity-0').fill('1.5');
    await page.getByTestId('purchase-item-cost-0').fill('25000');
    await page.getByTestId('submit-purchase-btn').click();
    await expect(page.getByText(/Cada ítem debe tener presentación/)).toContainText('cantidad entera positiva');
    await page.getByTestId('purchase-item-cost-0').fill('25000.001');
    expect(await page.getByTestId('purchase-item-cost-0').evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false);
    await page.getByTestId('purchase-item-quantity-0').fill('0');
    await page.getByTestId('purchase-item-cost-0').fill('25000');
    expect(await page.getByTestId('purchase-item-quantity-0').evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false);
  });
});
