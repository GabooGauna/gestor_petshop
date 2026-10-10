import { expect, test, type Page } from '@playwright/test';
import { installMockBackend, loginWithMockUser, mockCatalog } from './support/e2e';

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const dimensions = await page.evaluate(() => {
    const main = document.querySelector('main');
    return {
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      mainClientWidth: main?.clientWidth ?? 0,
      mainScrollWidth: main?.scrollWidth ?? 0,
    };
  });

  expect(dimensions.documentScrollWidth).toBeLessThanOrEqual(dimensions.documentClientWidth + 1);
  expect(dimensions.mainScrollWidth).toBeLessThanOrEqual(dimensions.mainClientWidth + 1);
}

async function openSection(page: Page, section: string, compactNavigation: boolean) {
  if (compactNavigation) {
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await page.locator('aside[aria-label="Navegación principal"]').getByRole('button', { name: section, exact: true }).click();
    return;
  }
  await page.getByRole('button', { name: section, exact: true }).click();
}

async function expectDialogFitsViewport(page: Page, name: string) {
  const dialog = page.getByRole('dialog', { name });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
}

test.describe('Navegación y catálogo responsive', () => {
  test('adapta Inicio, Productos y Nuevo producto a un teléfono', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMockBackend(page);
    await loginWithMockUser(page);

    await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeVisible();
    await expect(page.getByTestId('stock-overview')).toBeVisible();
    await expect(page.getByTestId('mobile-stock-list')).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole('button', { name: 'Abrir menú' }).click();
    const navigation = page.locator('aside[aria-label="Navegación principal"]');
    await expect(navigation).toBeVisible();
    await navigation.getByRole('button', { name: 'Productos', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Productos', exact: true })).toBeVisible();
    await expect(page.getByText('Alimento QA', { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByTestId('btn-new-product').click();
    await expect(page.getByTestId('new-product-form')).toBeVisible();
    await expect(page.getByTestId('product-name-input')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('usa el menú compacto también en tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await installMockBackend(page);
    await loginWithMockUser(page);

    await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Estado del stock' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('permite recorrer el catálogo móvil hasta el último producto', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMockBackend(page);

    const manyProducts = Array.from({ length: 14 }, (_, index) => ({
      ...mockCatalog.products[index % mockCatalog.products.length],
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      name: `Producto móvil ${String(index + 1).padStart(2, '0')}`,
      product_presentations: [{
        ...mockCatalog.products[index % mockCatalog.products.length].product_presentations[0],
        id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        product_id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      }],
    }));

    await page.route('**/rest/v1/products*', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(manyProducts),
    }));
    await loginWithMockUser(page);

    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await page.locator('aside[aria-label="Navegación principal"]').getByRole('button', { name: 'Productos', exact: true }).click();

    const lastProduct = page.getByText('Producto móvil 14', { exact: true });
    await expect(page.locator('tbody > tr')).toHaveCount(14);
    await expect(lastProduct).toBeVisible();
    await lastProduct.scrollIntoViewIfNeeded();
    await expectNoHorizontalOverflow(page);
  });

  test('permite cargar un ítem y revisar el ticket del POS en móvil', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMockBackend(page);
    await loginWithMockUser(page);

    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await page.locator('aside[aria-label="Navegación principal"]').getByRole('button', { name: 'Punto de Venta', exact: true }).click();

    await page.getByLabel('Producto').selectOption({ label: 'Correa QA' });
    await page.getByLabel('Presentación').selectOption({ label: 'Unidad' });
    await page.getByTestId('pos-input-value').fill('2');
    await page.getByRole('button', { name: 'Agregar al ticket' }).click();

    const ticket = page.getByTestId('pos-ticket-panel');
    await ticket.scrollIntoViewIfNeeded();
    await expect(ticket).toContainText('Correa QA');
    await expect(ticket).toContainText('$16000.00');
    await expect(page.getByRole('button', { name: 'Cobrar ticket' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('muestra las filas de Compras como tarjetas editables en móvil', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMockBackend(page);
    await loginWithMockUser(page);

    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await page.locator('aside[aria-label="Navegación principal"]').getByRole('button', { name: 'Compras', exact: true }).click();

    await page.getByTestId('purchase-item-product-0').selectOption(mockCatalog.products[0].id);
    await page.getByTestId('purchase-item-presentation-0').selectOption(mockCatalog.products[0].product_presentations[0].id);
    await page.getByTestId('purchase-item-quantity-0').fill('10');
    await page.getByTestId('purchase-item-cost-0').fill('25000');

    const total = page.getByTestId('purchase-total-amount');
    await total.scrollIntoViewIfNeeded();
    await expect(total).toContainText('250.000,00');
    await expect(page.getByTestId('submit-purchase-btn')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  for (const viewport of [
    { name: 'teléfono', width: 390, height: 844 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'límite desktop', width: 1024, height: 768 },
    { name: 'notebook', width: 1366, height: 768 },
    { name: 'escritorio', width: 1440, height: 900 },
  ]) {
    test(`adapta todos los paneles de Inventario en ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installMockBackend(page);
      const movements = [
        { id: '1', product_id: mockCatalog.products[0].id, presentation_id: mockCatalog.products[0].product_presentations[0].id, type: 'compra', quantity: 20, reason: 'Compra responsive', reference_id: null, reference_type: null, created_at: '2026-10-10T12:00:00Z' },
        { id: '2', product_id: mockCatalog.products[1].id, presentation_id: mockCatalog.products[1].product_presentations[0].id, type: 'merma', quantity: -1, reason: 'Merma responsive', reference_id: null, reference_type: null, created_at: '2026-10-10T13:00:00Z' },
      ];
      await page.route('**/rest/v1/inventory_movements*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(movements) }));
      await loginWithMockUser(page);
      await openSection(page, 'Inventario', viewport.width < 1024);

      await page.getByTestId('shrinkage-product-select').selectOption(mockCatalog.products[1].id);
      await page.getByTestId('shrinkage-presentation-select').selectOption(mockCatalog.products[1].product_presentations[0].id);
      await expect(page.getByText('Stock actual: 15 uds')).toBeVisible();

      await page.getByTestId('tab-ajustes').click();
      await page.getByTestId('adjustment-product-select').selectOption(mockCatalog.products[1].id);
      await page.getByTestId('adjustment-presentation-select').selectOption(mockCatalog.products[1].product_presentations[0].id);
      await page.getByTestId('adjustment-physical-input').fill('14');
      await expect(page.getByText('Diferencia').locator('..')).toContainText('-1 uds');

      await page.getByTestId('tab-kardex').click();
      await expect(page.getByTestId('inventory-movements-list')).toContainText('Merma responsive');
      await expectNoHorizontalOverflow(page);
    });

    test(`permite recorrer los 16 movimientos del Kardex en ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installMockBackend(page);
      const movements = Array.from({ length: 16 }, (_, index) => ({
        id: `movement-${index + 1}`,
        product_id: mockCatalog.products[index % mockCatalog.products.length].id,
        presentation_id: mockCatalog.products[index % mockCatalog.products.length].product_presentations[0].id,
        type: index % 3 === 0 ? 'merma' : 'compra',
        quantity: index % 3 === 0 ? -1 : 10,
        reason: `Movimiento visible ${String(index + 1).padStart(2, '0')}`,
        reference_id: null,
        reference_type: null,
        created_at: new Date(Date.UTC(2026, 9, 10, 12, index)).toISOString(),
      }));
      await page.route('**/rest/v1/inventory_movements*', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(movements),
      }));
      await loginWithMockUser(page);
      await openSection(page, 'Inventario', viewport.width < 1024);
      await page.getByTestId('tab-kardex').click();

      const list = page.getByTestId('inventory-movements-list');
      await expect(page.getByText('16 registros')).toBeVisible();
      const rows = list.locator('tbody > tr');
      await expect(rows).toHaveCount(16);
      const lastMovement = rows.last();
      await lastMovement.scrollIntoViewIfNeeded();
      await expect(lastMovement).toBeVisible();
      await expect(lastMovement).toContainText('Movimiento visible 16');
      await expectNoHorizontalOverflow(page);
    });

    test(`mantiene los modales dentro del viewport de ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installMockBackend(page);
      await loginWithMockUser(page);
      const compact = viewport.width < 1024;

      await openSection(page, 'Productos', compact);
      await page.getByTestId('btn-manage-categories').click();
      await expectDialogFitsViewport(page, 'Administrar Categorías');
      await page.getByRole('button', { name: 'Cerrar categorías' }).click();

      await openSection(page, 'Compras', compact);
      await page.getByTestId('btn-open-supplier-modal').click();
      await expectDialogFitsViewport(page, 'Administrar Proveedores');
      await page.getByRole('button', { name: 'Cerrar proveedores' }).click();

      await page.getByTestId('btn-create-product-from-purchase').click();
      await expectDialogFitsViewport(page, 'Nuevo Producto en Local');
      await page.getByRole('button', { name: 'Cerrar nuevo producto' }).click();

      await page.getByTestId('purchase-item-product-0').selectOption(mockCatalog.products[0].id);
      await page.getByTestId('btn-quick-presentation-0').click();
      await expectDialogFitsViewport(page, 'Nueva Presentación');
      await page.getByRole('button', { name: 'Cerrar nueva presentación' }).click();
      await expectNoHorizontalOverflow(page);
    });
  }
});
