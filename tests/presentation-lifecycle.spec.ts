import { expect, test, type Page } from '@playwright/test';
import { installMockBackend, loginWithMockUser, mockCatalog } from './support/e2e';

const archivedPresentation = {
  ...mockCatalog.products[0].product_presentations[0],
  id: 'abababab-abab-4bab-8bab-abababababab',
  name: 'Bolsa histórica 10 kg',
  weight_kg: 10,
  cost: 12000,
  price: 18000,
  price_per_kg: 1800,
  stock: 10,
  status: 'inactive',
};

function catalogWithArchived(status: 'active' | 'inactive' = 'inactive') {
  return mockCatalog.products.map((product, index) => index === 0
    ? {
        ...product,
        product_presentations: [
          ...product.product_presentations,
          { ...archivedPresentation, status },
        ],
      }
    : product);
}

async function installCatalogWithArchived(page: Page): Promise<void> {
  await installMockBackend(page);
  await page.route('**/rest/v1/products*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(catalogWithArchived()),
  }));
}

test.describe('Presentaciones — archivado, operación e históricos', () => {
  test('distingue stock operativo e inmovilizado y mantiene administrable la presentación', async ({ page }) => {
    await installCatalogWithArchived(page);
    await loginWithMockUser(page);
    await page.getByRole('button', { name: 'Productos', exact: true }).click();

    await expect(page.getByTestId('inventory-total-cost')).toContainText('325.000');
    await expect(page.getByTestId('inventory-total-sale-value')).toContainText('470.000');
    await expect(page.getByTestId('inventory-archived-cost')).toContainText('12.000');
    await expect(page.getByTestId('inventory-archived-sale-value')).toContainText('18.000');

    const product = mockCatalog.products[0];
    await page.getByTestId(`toggle-presentations-${product.id}`).click();
    const archivedRow = page.getByTestId(`presentation-${archivedPresentation.id}`);
    await expect(archivedRow).toContainText(archivedPresentation.name);
    await expect(archivedRow).toContainText('Archivada');
    await expect(archivedRow).toContainText('10 kg');
    await expect(archivedRow).toContainText('$12.000');
    await expect(page.getByTestId(`archived-stock-${product.id}`)).toContainText('10 kg inmovilizados');
    await expect(page.getByTestId(`edit-presentation-${archivedPresentation.id}`)).toBeDisabled();
    await expect(page.getByTestId(`reactivate-presentation-${archivedPresentation.id}`)).toBeVisible();
  });

  test('archiva y reactiva la misma fila preservando stock y costo', async ({ page }) => {
    let lifecycleStatus: 'active' | 'inactive' = 'active';
    let archiveBody: unknown;
    let reactivateBody: unknown;

    await installMockBackend(page);
    await page.route('**/rest/v1/products*', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(catalogWithArchived(lifecycleStatus)),
    }));
    await page.route('**/rest/v1/rpc/archive_presentation', async route => {
      archiveBody = route.request().postDataJSON();
      lifecycleStatus = 'inactive';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          presentation_id: archivedPresentation.id,
          product_id: archivedPresentation.product_id,
          name: archivedPresentation.name,
          status: 'inactive', archived: true, reactivated: false,
        }),
      });
    });
    await page.route('**/rest/v1/rpc/reactivate_presentation', async route => {
      reactivateBody = route.request().postDataJSON();
      lifecycleStatus = 'active';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          presentation_id: archivedPresentation.id,
          product_id: archivedPresentation.product_id,
          name: archivedPresentation.name,
          status: 'active', archived: false, reactivated: true,
        }),
      });
    });

    await loginWithMockUser(page);
    await page.getByRole('button', { name: 'Productos', exact: true }).click();
    await page.getByTestId(`toggle-presentations-${mockCatalog.products[0].id}`).click();
    await page.getByTestId(`archive-presentation-${archivedPresentation.id}`).click();
    await expect(page.getByRole('heading', { name: '¿Archivar esta presentación?' })).toBeVisible();
    await expect(page.getByText(/ventas, compras, ajustes y mermas/i)).toBeVisible();
    await page.getByRole('button', { name: 'Sí, archivar' }).click();
    await expect.poll(() => archiveBody).toEqual({ p_presentation_id: archivedPresentation.id });
    await expect(page.getByRole('heading', { name: 'Presentación archivada' })).toBeVisible();
    await page.getByRole('button', { name: 'OK' }).click();

    const archivedRow = page.getByTestId(`presentation-${archivedPresentation.id}`);
    await expect(archivedRow).toContainText('Archivada');
    await expect(archivedRow).toContainText('10 kg');
    await expect(archivedRow).toContainText('$12.000');
    await page.getByTestId(`reactivate-presentation-${archivedPresentation.id}`).click();
    await expect.poll(() => reactivateBody).toEqual({ p_presentation_id: archivedPresentation.id });
    await expect(page.getByRole('heading', { name: 'Presentación reactivada' })).toBeVisible();
    await page.getByRole('button', { name: 'OK' }).click();
    await expect(page.getByTestId(`presentation-${archivedPresentation.id}`)).toContainText('Activa');
    await expect(page.getByTestId(`presentation-${archivedPresentation.id}`)).toContainText('10 kg');
    await expect(page.getByTestId(`presentation-${archivedPresentation.id}`)).toContainText('$12.000');
  });

  test('muestra el error estable cuando una carrera deja la presentación ya archivada', async ({ page }) => {
    await installMockBackend(page);
    await page.route('**/rest/v1/rpc/archive_presentation', route => route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'P0001', message: 'PRESENTATION_ALREADY_INACTIVE' }),
    }));
    await loginWithMockUser(page);
    await page.getByRole('button', { name: 'Productos', exact: true }).click();
    await page.getByTestId(`toggle-presentations-${mockCatalog.products[0].id}`).click();
    await page.getByTestId(`archive-presentation-${mockCatalog.products[0].product_presentations[0].id}`).click();
    await page.getByRole('button', { name: 'Sí, archivar' }).click();
    await expect(page.getByRole('heading', { name: 'No se pudo archivar' })).toBeVisible();
    await expect(page.getByText('La presentación ya está archivada.')).toBeVisible();
  });

  test('excluye archivadas de dashboard, POS, compras, ajustes y mermas', async ({ page }) => {
    await installCatalogWithArchived(page);
    await loginWithMockUser(page);

    await expect(page.getByTestId('low-stock-panel')).not.toContainText(archivedPresentation.name);

    await page.getByRole('button', { name: 'Punto de Venta', exact: true }).click();
    await page.getByLabel('Producto').selectOption(mockCatalog.products[0].id);
    await expect(page.getByLabel('Presentación')).not.toContainText(archivedPresentation.name);

    await page.getByRole('button', { name: 'Compras' }).click();
    await page.getByTestId('purchase-item-product-0').selectOption(mockCatalog.products[0].id);
    await expect(page.getByTestId('purchase-item-presentation-0')).not.toContainText(archivedPresentation.name);

    await page.getByRole('button', { name: 'Inventario' }).click();
    await page.getByTestId('shrinkage-product-select').selectOption(mockCatalog.products[0].id);
    await expect(page.getByTestId('shrinkage-presentation-select')).not.toContainText(archivedPresentation.name);
    await page.getByTestId('tab-ajustes').click();
    await page.getByTestId('adjustment-product-select').selectOption(mockCatalog.products[0].id);
    await expect(page.getByTestId('adjustment-presentation-select')).not.toContainText(archivedPresentation.name);
  });

  test('conserva el nombre archivado en Kardex y reporte de movimientos', async ({ page }) => {
    const movement = {
      id: 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',
      product_id: mockCatalog.products[0].id,
      presentation_id: archivedPresentation.id,
      type: 'venta',
      quantity: -2.5,
      reason: 'Venta histórica',
      reference_id: null,
      reference_type: 'sale',
      created_at: '2026-10-10T13:00:00Z',
      products: { name: mockCatalog.products[0].name },
      product_presentations: { name: archivedPresentation.name, stock: archivedPresentation.stock, weight_kg: archivedPresentation.weight_kg },
    };
    await installCatalogWithArchived(page);
    await page.route('**/rest/v1/inventory_movements*', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Content-Range': '0-0/1' },
      body: JSON.stringify([movement]),
    }));
    await page.route('**/rest/v1/rpc/get_inventory_movement_report', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total_count: 1,
        items: [{
          id: movement.id,
          created_at: movement.created_at,
          type: movement.type,
          product_id: movement.product_id,
          product_name: mockCatalog.products[0].name,
          presentation_id: archivedPresentation.id,
          presentation_name: archivedPresentation.name,
          quantity: '-2.500', unit: 'kg', reason: movement.reason,
          reference_type: movement.reference_type, reference_id: movement.reference_id,
        }],
      }),
    }));
    await loginWithMockUser(page);

    await page.getByRole('button', { name: 'Inventario' }).click();
    await page.getByTestId('tab-kardex').click();
    await expect(page.getByTestId('inventory-movements-list')).toContainText(archivedPresentation.name);

    await page.getByRole('button', { name: 'Reportes' }).click();
    await page.getByRole('tab', { name: 'Movimientos' }).click();
    await expect(page.getByText(archivedPresentation.name).last()).toBeVisible();
    await expect(page.getByText('Venta histórica').last()).toBeVisible();
  });
});
