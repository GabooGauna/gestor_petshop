import { expect, test } from '@playwright/test';
import { installMockBackend, loginWithMockUser, mockCatalog } from './support/e2e';

test.describe('Catálogo — presentaciones con stock propio', () => {
  test('configura el mínimo de la presentación inicial al crear un producto', async ({ page }) => {
    let rpcBody: unknown;
    await installMockBackend(page);
    await page.route('**/rest/v1/rpc/create_product_with_presentation', async route => {
      rpcBody = route.request().postDataJSON();
      await route.fallback();
    });
    await loginWithMockUser(page);
    await page.getByRole('button', { name: 'Productos', exact: true }).click();
    await page.getByTestId('btn-new-product').click();
    await page.getByTestId('product-name-input').fill('Juguete mínimo QA');
    await page.getByTestId('product-category-select').selectOption(mockCatalog.categories[0].id);
    await page.getByTestId('product-type-select').selectOption('unit');
    await page.getByTestId('presentation-min-stock-input').fill('4');
    await page.getByTestId('submit-new-product').click();

    await expect.poll(() => rpcBody).toMatchObject({
      p_name: 'Juguete mínimo QA',
      p_type: 'unit',
      p_min_stock: 4,
      p_initial_stock: '0',
    });
  });

  test('muestra el costo y el valor potencial de venta de todo el inventario', async ({ page }) => {
    await installMockBackend(page);
    await loginWithMockUser(page);
    await page.getByRole('button', { name: 'Productos', exact: true }).click();

    const summary = page.getByTestId('inventory-valuation-summary');
    await expect(summary).toBeVisible();
    await expect(page.getByTestId('inventory-total-cost')).toContainText('325.000');
    await expect(page.getByTestId('inventory-total-sale-value')).toContainText('470.000');
    await expect(summary).toContainText('Stock activo a costo registrado');
    await expect(summary).toContainText('Stock archivado inmovilizado');
    await expect(summary).toContainText('Importe bruto estimado antes de descontar costos');
  });

  test('advierte cuando una presentación con stock no tiene costo ni precio', async ({ page }) => {
    await installMockBackend(page);
    await page.route('**/rest/v1/products*', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockCatalog.products.map((product, index) => index === 1
        ? {
            ...product,
            product_presentations: product.product_presentations.map(presentation => ({
              ...presentation,
              cost: 0,
              price: 0,
            })),
          }
        : product)),
    }));
    await loginWithMockUser(page);
    await page.getByRole('button', { name: 'Productos', exact: true }).click();

    const summary = page.getByTestId('inventory-valuation-summary');
    await expect(page.getByTestId('inventory-total-cost')).toContainText('250.000');
    await expect(page.getByTestId('inventory-total-sale-value')).toContainText('350.000');
    await expect(summary).toContainText('1 presentación con stock sin costo');
    await expect(summary).toContainText('1 presentación con stock sin precio');
  });

  test('crea una variante con saldo inicial mediante una única RPC', async ({ page }) => {
    let rpcBody: unknown;
    await installMockBackend(page);
    await page.route('**/rest/v1/rpc/create_product_presentation', async route => {
      rpcBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '16161616-1616-4161-8161-161616161616',
          product_id: mockCatalog.products[1].id,
          name: 'Correa larga',
          weight_kg: null,
          cost: '8000.00',
          price: '8800.00',
          price_per_kg: null,
          stock: '6.000',
          min_stock: '3.000',
          created_at: '2026-10-10T13:00:00Z',
        }),
      });
    });

    await loginWithMockUser(page);
    await page.getByRole('button', { name: 'Productos', exact: true }).click();
    const product = mockCatalog.products[1];
    await page.getByTestId(`toggle-presentations-${product.id}`).click();
    await page.getByTestId(`add-presentation-btn-${product.id}`).click();

    await page.getByTestId('new-pres-name-input').fill('Correa larga');
    await page.getByTestId('new-pres-stock-input').fill('6');
    await page.getByTestId('new-pres-min-stock-input').fill('3');
    await page.getByTestId('new-pres-price-input').fill('8800');
    await page.getByTestId('new-pres-cost-input').fill('8000');
    await page.getByTestId('submit-new-presentation-btn').click();

    await expect.poll(() => rpcBody).toEqual({
      p_product_id: product.id,
      p_name: 'Correa larga',
      p_weight_kg: null,
      p_cost: '8000.00',
      p_price: '8800.00',
      p_price_per_kg: null,
      p_initial_stock: 6,
      p_min_stock: 3,
    });
    await expect(page.getByTestId('add-presentation-form')).toBeHidden();
  });

  test('rechaza stock fraccionario en productos vendidos por unidad', async ({ page }) => {
    let rpcRequests = 0;
    await installMockBackend(page);
    await page.route('**/rest/v1/rpc/create_product_presentation', async route => {
      rpcRequests += 1;
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });
    await loginWithMockUser(page);
    await page.getByRole('button', { name: 'Productos', exact: true }).click();
    const product = mockCatalog.products[1];
    await page.getByTestId(`toggle-presentations-${product.id}`).click();
    await page.getByTestId(`add-presentation-btn-${product.id}`).click();
    await page.getByTestId('new-pres-name-input').fill('Correa corta');
    const stockInput = page.getByTestId('new-pres-stock-input');
    await stockInput.fill('1.5');
    await page.getByTestId('submit-new-presentation-btn').click();

    expect(await stockInput.evaluate((input: HTMLInputElement) => input.validity.stepMismatch)).toBe(true);
    await expect(page.getByTestId('add-presentation-form')).toBeVisible();
    expect(rpcRequests).toBe(0);
  });
});
