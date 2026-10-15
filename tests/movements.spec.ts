import { expect, test, type Page } from '@playwright/test';
import { installMockBackend, loginWithMockUser, mockCatalog } from './support/e2e';

async function openInventory(page: Page): Promise<void> {
  await installMockBackend(page);
  await loginWithMockUser(page);
  await page.getByRole('button', { name: 'Inventario' }).click();
  await expect(page.getByRole('heading', { name: 'Inventario' })).toBeVisible();
}

test.describe('Inventario — mermas, ajustes y Kardex (backend simulado)', () => {
  test.beforeEach(async ({ page }) => openInventory(page));

  test('muestra las tres vistas y bloquea merma sin motivo', async ({ page }) => {
    await expect(page.getByTestId('tab-mermas')).toBeVisible();
    await expect(page.getByTestId('tab-ajustes')).toBeVisible();
    await expect(page.getByTestId('tab-kardex')).toBeVisible();
    await page.getByTestId('shrinkage-submit').click();
    await expect(page.getByTestId('shrinkage-error')).toContainText('Seleccioná un producto');
  });

  test('la merma envía una única RPC y actualiza el stock del desplegable sin recargar', async ({ page }) => {
    let rpcBody: unknown;
    await page.route('**/rest/v1/rpc/record_shrinkage', async route => {
      rpcBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        movement_id: '12121212-1212-4121-8121-121212121212',
        product_id: mockCatalog.products[0].id,
        presentation_id: mockCatalog.products[0].product_presentations[0].id,
        quantity: '-190.500', stock_before: '200.000', stock_after: '9.500',
      }) });
    });
    await page.getByTestId('shrinkage-product-select').selectOption(mockCatalog.products[0].id);
    await page.getByTestId('shrinkage-presentation-select').selectOption(mockCatalog.products[0].product_presentations[0].id);
    await page.getByTestId('shrinkage-quantity-input').fill('190.5');
    await page.getByRole('button', { name: 'Alimento vencido' }).click();
    await page.getByTestId('shrinkage-submit').click();
    await expect.poll(() => rpcBody).toBeTruthy();
    expect(rpcBody).toEqual({
      p_presentation_id: mockCatalog.products[0].product_presentations[0].id,
      p_quantity: '190.5', p_reason: 'Alimento vencido',
    });
    await expect(page.getByTestId('inventory-success')).toBeVisible();

    await page.getByTestId('shrinkage-product-select').selectOption(mockCatalog.products[0].id);
    await expect(page.getByTestId('shrinkage-presentation-select')).toContainText('stock: 9,5 · mín: 10 kg');
    await page.getByRole('button', { name: 'Inicio' }).click();
    await expect(page.getByTestId(`low-stock-${mockCatalog.products[0].product_presentations[0].id}`)).toContainText('Disponible: 9,5 kg · Mínimo: 10 kg');
  });

  test('el ajuste envía stock físico, no un delta calculado por el navegador', async ({ page }) => {
    let rpcBody: unknown;
    await page.route('**/rest/v1/rpc/record_stock_adjustment', async route => {
      rpcBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        movement_id: '13131313-1313-4131-8131-131313131313',
        product_id: mockCatalog.products[0].id,
        presentation_id: mockCatalog.products[0].product_presentations[0].id,
        quantity: '-192.000', stock_before: '200.000', stock_after: '8.000',
      }) });
    });
    await page.getByTestId('tab-ajustes').click();
    await page.getByTestId('adjustment-product-select').selectOption(mockCatalog.products[0].id);
    await page.getByTestId('adjustment-presentation-select').selectOption(mockCatalog.products[0].product_presentations[0].id);
    await page.getByTestId('adjustment-physical-input').fill('8');
    await page.getByTestId('adjustment-reason-input').fill('Conteo QA');
    await page.getByTestId('adjustment-submit').click();
    await expect.poll(() => rpcBody).toBeTruthy();
    expect(rpcBody).toEqual({
      p_presentation_id: mockCatalog.products[0].product_presentations[0].id,
      p_physical_stock: '8', p_reason: 'Conteo QA',
    });

    await page.getByTestId('adjustment-product-select').selectOption(mockCatalog.products[0].id);
    await page.getByTestId('adjustment-presentation-select').selectOption(mockCatalog.products[0].product_presentations[0].id);
    await expect(page.getByText('Stock en sistema').locator('..')).toContainText('8');
    await page.getByRole('button', { name: 'Inicio' }).click();
    await expect(page.getByTestId(`low-stock-${mockCatalog.products[0].product_presentations[0].id}`)).toContainText('Disponible: 8 kg · Mínimo: 10 kg');
  });

  test('muestra diferencias de unidades sin decimales', async ({ page }) => {
    const unitProduct = mockCatalog.products[1];
    await page.getByTestId('tab-ajustes').click();
    await page.getByTestId('adjustment-product-select').selectOption(unitProduct.id);
    await page.getByTestId('adjustment-presentation-select').selectOption(unitProduct.product_presentations[0].id);
    await page.getByTestId('adjustment-physical-input').fill('14');

    const differenceCard = page.getByText('Diferencia').locator('..');
    await expect(differenceCard).toContainText('-1 uds');
    await expect(differenceCard).not.toContainText('-1,000 uds');
  });

  test('Kardex representa compra positiva y venta/merma negativas', async ({ page }) => {
    const movements = [
      { id: '1', product_id: mockCatalog.products[0].id, presentation_id: mockCatalog.products[0].product_presentations[0].id, type: 'compra', quantity: 20, reason: 'Compra 11111111-2222-4333-8444-555555555555', reference_id: '11111111-2222-4333-8444-555555555555', reference_type: 'purchase', created_at: '2026-10-09T12:00:00Z', products: { name: mockCatalog.products[0].name }, product_presentations: { name: mockCatalog.products[0].product_presentations[0].name, stock: 200, weight_kg: 20 } },
      { id: '2', product_id: mockCatalog.products[0].id, presentation_id: mockCatalog.products[0].product_presentations[0].id, type: 'venta', quantity: -2.5, reason: 'Venta QA', reference_id: null, reference_type: null, created_at: '2026-10-09T13:00:00Z', products: { name: mockCatalog.products[0].name }, product_presentations: { name: mockCatalog.products[0].product_presentations[0].name, stock: 200, weight_kg: 20 } },
      { id: '3', product_id: mockCatalog.products[0].id, presentation_id: mockCatalog.products[0].product_presentations[0].id, type: 'merma', quantity: -0.5, reason: 'Merma QA', reference_id: null, reference_type: null, created_at: '2026-10-09T14:00:00Z', products: { name: mockCatalog.products[0].name }, product_presentations: { name: mockCatalog.products[0].product_presentations[0].name, stock: 200, weight_kg: 20 } },
    ];
    await page.unroute('**/rest/v1/inventory_movements*');
    await page.route('**/rest/v1/inventory_movements*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(movements) }));
    await page.reload();
    await expect(page.getByRole('button', { name: 'Inventario' })).toBeVisible();
    await page.getByRole('button', { name: 'Inventario' }).click();
    await page.getByTestId('tab-kardex').click();
    await expect(page.getByRole('table')).toContainText('Alimento QA');
    await expect(page.getByRole('table')).toContainText('Bolsa 20 kg');
    await expect(page.getByRole('table')).not.toContainText(mockCatalog.products[0].product_presentations[0].id.slice(0, 8));
    await expect(page.getByRole('table')).not.toContainText('11111111-2222-4333-8444-555555555555');
    await expect(page.getByRole('table')).toContainText('+20,000');
    await expect(page.getByRole('table')).toContainText('-2,500');
    await expect(page.getByRole('table')).toContainText('-0,500');
  });
});
