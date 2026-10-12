import { expect, test, type Page } from '@playwright/test';
import { installMockBackend, loginWithMockUser, mockCatalog } from './support/e2e';

async function openPurchases(page: Page): Promise<void> {
  await installMockBackend(page);
  await loginWithMockUser(page);
  await page.getByRole('button', { name: 'Compras' }).click();
  await expect(page.getByRole('heading', { name: 'Registrar Compra' })).toBeVisible();
}

async function fillWeightProductModal(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Nuevo Producto en Local' });
  const textInputs = dialog.locator('input[type="text"]');
  const numberInputs = dialog.locator('input[type="number"]');

  await page.getByTestId('purchase-new-prod-name').fill('Dog Chow Adulto razas medianas y grandes');
  await page.getByTestId('purchase-new-prod-cat').selectOption(mockCatalog.categories[0].id);
  await textInputs.nth(1).fill('Bolsa 21kg');
  await numberInputs.nth(0).fill('21');
  await numberInputs.nth(1).fill('75000');
  await numberInputs.nth(2).fill('95000');
  await numberInputs.nth(3).fill('10');
}

test('permite crear la primera categoría desde el alta de producto de una compra', async ({ page }) => {
  const createdCategory = {
    id: '17171717-1717-4171-8171-171717171717',
    name: 'Accesorios',
    created_at: '2026-10-11T12:00:00Z',
  };
  let categoryRequestBody: unknown;

  await page.addInitScript(() => window.localStorage.clear());
  await installMockBackend(page);
  await page.route('**/rest/v1/categories*', async route => {
    if (route.request().method() === 'POST') {
      categoryRequestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(createdCategory),
      });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await loginWithMockUser(page);
  await page.getByRole('button', { name: 'Compras' }).click();
  await page.getByTestId('btn-create-product-from-purchase').click();

  await expect(page.getByText('Creá la primera categoría para continuar.')).toBeVisible();
  await page.getByTestId('purchase-new-category-input').fill(createdCategory.name);
  await page.getByTestId('purchase-save-new-category').click();

  await expect.poll(() => categoryRequestBody).toEqual({ name: createdCategory.name });
  await expect(page.getByTestId('purchase-new-prod-cat')).toHaveValue(createdCategory.id);
  await expect(page.getByTestId('purchase-new-prod-cat')).toContainText(createdCategory.name);
  await page.getByTestId('purchase-new-prod-name').fill('Correa mediana');
  await expect(page.getByTestId('purchase-confirm-new-prod-btn')).toBeEnabled();
});

test.describe('Compras v2 (backend simulado)', () => {
  test('compra una bolsa como 1 bulto, cobra su costo unitario e ingresa 21 kg al stock', async ({ page }) => {
    const createdProductId = '20202020-2020-4020-8020-202020202020';
    const createdPresentationId = '21212121-2121-4121-8121-212121212121';
    let productRpcBody: unknown;
    let purchaseRpcBody: unknown;
    let productCreated = false;

    const createdProduct = {
      id: createdProductId,
      name: 'Dog Chow Adulto razas medianas y grandes',
      brand: null,
      category_id: mockCatalog.categories[0].id,
      type: 'weight',
      min_stock: 0,
      status: 'active',
      created_at: '2026-10-11T15:00:00Z',
      product_presentations: [{
        id: createdPresentationId,
        product_id: createdProductId,
        name: 'Bolsa 21kg',
        weight_kg: 21,
        cost: 75000,
        price: 95000,
        price_per_kg: 4976.19,
        stock: 0,
        status: 'active',
        created_at: '2026-10-11T15:00:00Z',
      }],
    };

    await page.addInitScript(() => window.localStorage.clear());
    await installMockBackend(page);
    await page.route('**/rest/v1/products*', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(productCreated ? [...mockCatalog.products, createdProduct] : mockCatalog.products),
    }));
    await page.route('**/rest/v1/rpc/create_product_with_presentation', async route => {
      productRpcBody = route.request().postDataJSON();
      productCreated = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: createdProductId,
          name: createdProduct.name,
          brand: null,
          category_id: createdProduct.category_id,
          type: 'weight',
          min_stock: '0.000',
          status: 'active',
          created_at: createdProduct.created_at,
          presentation_id: createdPresentationId,
        }),
      });
    });
    await page.route('**/rest/v1/rpc/process_purchase', async route => {
      purchaseRpcBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          purchase_id: '22222222-2222-4222-8222-222222222222',
          total_amount: '75000.00',
          items: [{
            purchase_item_id: '23232323-2323-4232-8232-232323232323',
            product_id: createdProductId,
            presentation_id: createdPresentationId,
            quantity: '1',
            unit_cost: '75000.00',
            subtotal: '75000.00',
            stock_added: '21.000',
            stock_after: '21.000',
          }],
        }),
      });
    });

    await loginWithMockUser(page);
    await page.getByRole('button', { name: 'Compras' }).click();
    await page.getByTestId('btn-create-product-from-purchase').click();
    await fillWeightProductModal(page);
    await page.getByTestId('purchase-confirm-new-prod-btn').click();

    await expect.poll(() => productRpcBody).toEqual({
      p_name: createdProduct.name,
      p_brand: null,
      p_category_id: mockCatalog.categories[0].id,
      p_type: 'weight',
      p_min_stock: 0,
      p_presentation_name: 'Bolsa 21kg',
      p_weight_kg: 21,
      p_cost: '75000.00',
      p_price: '95000.00',
      p_price_per_kg: '4976.19',
      p_initial_stock: '0',
    });
    await expect(page.getByRole('dialog', { name: 'Nuevo Producto en Local' })).toHaveCount(0);
    await expect(page.getByTestId('purchase-item-product-0')).toHaveValue(createdProductId);
    await expect(page.getByTestId('purchase-item-presentation-0')).toHaveValue(createdPresentationId);
    await expect(page.getByTestId('purchase-item-cost-0')).toHaveValue('75000');
    await expect(page.getByTestId('purchase-item-quantity-unit-0')).toHaveText('bultos');
    await expect(page.getByTestId('purchase-item-quantity-0')).toHaveAttribute('aria-label', 'Cantidad de bultos');

    await page.getByTestId('purchase-supplier-select').selectOption(mockCatalog.suppliers[0].id);
    await page.getByTestId('purchase-invoice-input').fill('E2E-DOG-CHOW-001');
    await page.getByTestId('purchase-item-quantity-0').fill('1');
    await expect(page.getByTestId('purchase-total-amount')).toContainText('75.000,00');
    await page.getByTestId('submit-purchase-btn').click();

    await expect.poll(() => purchaseRpcBody).toEqual({
      p_supplier_id: mockCatalog.suppliers[0].id,
      p_invoice_number: 'E2E-DOG-CHOW-001',
      p_items: [{
        presentation_id: createdPresentationId,
        quantity: '1',
        unit_cost: '75000.00',
      }],
    });
    await expect(page.getByTestId('product-success-banner')).toContainText('Compra registrada y stock actualizado con éxito.');
  });

  test('muestra un mensaje útil cuando Supabase rechaza el precio del producto', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
    await installMockBackend(page);
    await page.route('**/rest/v1/rpc/create_product_with_presentation', route => route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'P0001',
        message: 'INVALID_PRICE',
        details: null,
        hint: null,
      }),
    }));

    await loginWithMockUser(page);
    await page.getByRole('button', { name: 'Compras' }).click();
    await page.getByTestId('btn-create-product-from-purchase').click();
    await fillWeightProductModal(page);
    await page.getByTestId('purchase-confirm-new-prod-btn').click();

    const dialog = page.getByRole('dialog', { name: 'Nuevo Producto en Local' });
    await expect(dialog.getByRole('alert')).toContainText('Precio y costo deben ser valores positivos con hasta dos decimales.');
    await expect(dialog.getByRole('alert')).not.toContainText('No se pudo crear el producto');
    await expect(page.getByTestId('purchase-new-prod-name')).toHaveValue('Dog Chow Adulto razas medianas y grandes');
  });

  test('consulta proveedores sin provocar un 400 durante despliegues escalonados', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
    await installMockBackend(page);
    let supplierRequests = 0;
    await page.route('**/rest/v1/suppliers*', route => {
      supplierRequests += 1;
      const requestUrl = new URL(route.request().url());
      expect(requestUrl.searchParams.has('active')).toBe(false);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          ...mockCatalog.suppliers.map(supplier => ({
            id: supplier.id,
            name: supplier.name,
            contact_info: supplier.contact_info,
            created_at: supplier.created_at,
          })),
          {
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc',
            name: 'Proveedor archivado',
            contact_info: null,
            created_at: null,
            active: false,
          },
        ]),
      });
    });
    await loginWithMockUser(page);
    await page.getByRole('button', { name: 'Compras' }).click();

    const product = page.getByTestId('purchase-item-product-0');
    await expect(product).toContainText(mockCatalog.products[0].name);
    await expect(product).toContainText(mockCatalog.products[1].name);
    await expect(page.getByTestId('purchase-supplier-select')).toContainText(mockCatalog.suppliers[0].name);
    await expect(page.getByTestId('purchase-supplier-select')).not.toContainText('Proveedor archivado');
    await expect(page.getByText(/No se pudieron cargar los proveedores/)).toHaveCount(0);
    expect(supplierRequests).toBeGreaterThan(0);
  });

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

  test('distingue bultos de alimento de unidades de accesorios', async ({ page }) => {
    const product = page.getByTestId('purchase-item-product-0');
    const quantity = page.getByTestId('purchase-item-quantity-0');
    const unit = page.getByTestId('purchase-item-quantity-unit-0');

    await product.selectOption(mockCatalog.products[0].id);
    await expect(unit).toHaveText('bultos');
    await expect(quantity).toHaveAttribute('aria-label', 'Cantidad de bultos');

    await product.selectOption(mockCatalog.products[1].id);
    await expect(unit).toHaveText('unidades');
    await expect(quantity).toHaveAttribute('aria-label', 'Cantidad de unidades');
  });

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
    expect(await page.getByTestId('purchase-item-quantity-0').evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false);
    await expect(page.getByTestId('submit-purchase-btn')).toBeDisabled();
    await page.getByTestId('purchase-item-cost-0').fill('25000.001');
    expect(await page.getByTestId('purchase-item-cost-0').evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false);
    await page.getByTestId('purchase-item-quantity-0').fill('0');
    await page.getByTestId('purchase-item-cost-0').fill('25000');
    expect(await page.getByTestId('purchase-item-quantity-0').evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false);
  });

  test('elimina un proveedor de las compras nuevas conservando el historial', async ({ page }) => {
    let requestBody: unknown;
    await page.route('**/rest/v1/rpc/remove_supplier', async route => {
      requestBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          supplier_id: mockCatalog.suppliers[0].id,
          name: mockCatalog.suppliers[0].name,
          deleted: true,
          archived: false,
        }),
      });
    });

    await page.getByTestId('purchase-supplier-select').selectOption(mockCatalog.suppliers[0].id);
    await page.getByTestId('btn-open-supplier-modal').click();
    await page.getByRole('button', { name: `Eliminar proveedor ${mockCatalog.suppliers[0].name}` }).click();

    await expect(page.getByRole('heading', { name: '¿Eliminar este proveedor?' })).toBeVisible();
    await expect(page.getByText(/sus datos se conservarán en el historial/i)).toBeVisible();
    await page.getByRole('button', { name: 'Sí, eliminar proveedor' }).click();

    await expect.poll(() => requestBody).toEqual({ p_supplier_id: mockCatalog.suppliers[0].id });
    await expect(page.getByRole('heading', { name: 'Proveedor eliminado' })).toBeVisible();
    await page.getByRole('button', { name: 'OK' }).click();
    await expect(page.getByText(mockCatalog.suppliers[0].name, { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('purchase-supplier-select')).toHaveValue('');
  });

  test('permite cancelar la eliminación de un proveedor', async ({ page }) => {
    let requests = 0;
    await page.route('**/rest/v1/rpc/remove_supplier', async route => {
      requests += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.getByTestId('btn-open-supplier-modal').click();
    await page.getByRole('button', { name: `Eliminar proveedor ${mockCatalog.suppliers[0].name}` }).click();
    await page.getByRole('button', { name: 'Cancelar' }).click();

    expect(requests).toBe(0);
    await expect(
      page.getByRole('dialog', { name: 'Administrar Proveedores' })
        .getByText(mockCatalog.suppliers[0].name, { exact: true }),
    ).toBeVisible();
  });
});
