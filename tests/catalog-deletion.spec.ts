import { expect, test } from '@playwright/test';
import { installMockBackend, loginWithMockUser, mockCatalog } from './support/e2e';

test.describe('Catálogo — eliminación segura', () => {
  test.beforeEach(async ({ page }) => {
    await installMockBackend(page);
    await loginWithMockUser(page);
    await page.getByRole('button', { name: 'Productos', exact: true }).click();
  });

  test('solicita confirmación y elimina un producto mediante RPC', async ({ page }) => {
    let requestBody: unknown;
    await page.route('**/rest/v1/rpc/delete_product', async route => {
      requestBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ deleted: true }) });
    });
    await page.getByRole('button', { name: 'Eliminar producto Alimento QA' }).click();
    await expect(page.getByRole('heading', { name: '¿Eliminar este producto?' })).toBeVisible();
    await expect(page.getByText(/stock actual y sus movimientos de inventario/i)).toBeVisible();
    await page.getByRole('button', { name: 'Sí, eliminar producto' }).click();
    await expect.poll(() => requestBody).toEqual({ p_product_id: mockCatalog.products[0].id });
    await expect(page.getByRole('heading', { name: 'Producto eliminado' })).toBeVisible();
  });

  test('solicita confirmación y elimina una presentación mediante RPC', async ({ page }) => {
    let requestBody: unknown;
    await page.route('**/rest/v1/rpc/delete_presentation', async route => {
      requestBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ deleted: true }) });
    });
    await page.getByTestId(`toggle-presentations-${mockCatalog.products[0].id}`).click();
    await page.getByRole('button', { name: 'Eliminar presentación Bolsa 20 kg' }).click();
    await expect(page.getByRole('heading', { name: '¿Eliminar esta presentación?' })).toBeVisible();
    await page.getByRole('button', { name: 'Sí, eliminar presentación' }).click();
    await expect.poll(() => requestBody).toEqual({ p_presentation_id: mockCatalog.products[0].product_presentations[0].id });
    await expect(page.getByRole('heading', { name: 'Presentación eliminada' })).toBeVisible();
  });
});
