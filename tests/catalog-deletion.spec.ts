import { expect, test } from '@playwright/test';
import { installMockBackend, loginWithMockUser, mockCatalog } from './support/e2e';

test.describe('Catálogo — bajas seguras', () => {
  test.beforeEach(async ({ page }) => {
    await installMockBackend(page);
    await loginWithMockUser(page);
    await page.getByRole('button', { name: 'Productos', exact: true }).click();
  });

  test('solicita confirmación y archiva un producto mediante RPC', async ({ page }) => {
    let requestBody: unknown;
    await page.route('**/rest/v1/rpc/delete_product', async route => {
      requestBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ deleted: false, archived: true }) });
    });
    await page.getByRole('button', { name: 'Dar de baja producto Alimento QA' }).click();
    await expect(page.getByRole('heading', { name: '¿Dar de baja este producto?' })).toBeVisible();
    await expect(page.getByText(/presentaciones, stock, ventas, compras y movimientos se conservarán/i)).toBeVisible();
    await page.getByRole('button', { name: 'Sí, dar de baja' }).click();
    await expect.poll(() => requestBody).toEqual({ p_product_id: mockCatalog.products[0].id });
    await expect(page.getByRole('heading', { name: 'Producto dado de baja' })).toBeVisible();
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

  test('confirma con SweetAlert antes de eliminar una categoría', async ({ page }) => {
    let deletedCategoryFilter: string | null = null;
    await page.route('**/rest/v1/categories*', async route => {
      if (route.request().method() !== 'DELETE') {
        await route.fallback();
        return;
      }

      deletedCategoryFilter = new URL(route.request().url()).searchParams.get('id');
      await route.fulfill({ status: 204, body: '' });
    });

    await page.getByTestId('btn-manage-categories').click();
    await page.getByRole('button', { name: `Eliminar categoría ${mockCatalog.categories[0].name}` }).click();

    await expect(page.getByRole('heading', { name: '¿Eliminar esta categoría?' })).toBeVisible();
    await expect(page.getByText(/productos vinculados seguirán disponibles/i)).toBeVisible();
    await page.getByRole('button', { name: 'Sí, eliminar categoría' }).click();

    await expect.poll(() => deletedCategoryFilter).toBe(`eq.${mockCatalog.categories[0].id}`);
    await expect(page.getByRole('heading', { name: 'Categoría eliminada' })).toBeVisible();
  });

  test('permite cancelar la eliminación de una categoría', async ({ page }) => {
    let deleteRequests = 0;
    await page.route('**/rest/v1/categories*', async route => {
      if (route.request().method() === 'DELETE') deleteRequests += 1;
      await route.fallback();
    });

    await page.getByTestId('btn-manage-categories').click();
    await page.getByRole('button', { name: `Eliminar categoría ${mockCatalog.categories[0].name}` }).click();
    await page.getByRole('button', { name: 'Cancelar' }).click();

    expect(deleteRequests).toBe(0);
    await expect(page.getByRole('dialog', { name: 'Administrar Categorías' })).toBeVisible();
  });
});
