import { expect, test } from '@playwright/test';
import { installMockBackend, loginWithMockUser, mockCatalog } from './support/e2e';

test.describe('Catálogo — edición de categoría', () => {
  test('cambia la categoría sin eliminar ni recrear el producto', async ({ page }) => {
    const nextCategory = { id: '99999999-9999-4999-8999-999999999999', name: 'Accesorios', created_at: null };
    let updated = false;
    let patchBody: unknown;

    await installMockBackend(page);
    await page.route('**/rest/v1/categories*', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([...mockCatalog.categories, nextCategory]),
    }));
    await page.route('**/rest/v1/products*', async route => {
      if (route.request().method() === 'PATCH') {
        patchBody = route.request().postDataJSON();
        updated = true;
        await route.fulfill({ status: 204, body: '' });
        return;
      }
      if (updated) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockCatalog.products.map(product => (
            product.id === mockCatalog.products[0].id ? { ...product, category_id: nextCategory.id } : product
          ))),
        });
        return;
      }
      await route.fallback();
    });

    await loginWithMockUser(page);
    await page.getByRole('button', { name: 'Productos', exact: true }).click();
    await page.getByRole('button', { name: `Editar categoría de ${mockCatalog.products[0].name}` }).click();
    await page.getByTestId(`product-category-select-${mockCatalog.products[0].id}`).selectOption(nextCategory.id);
    await page.getByRole('button', { name: `Guardar categoría de ${mockCatalog.products[0].name}` }).click();

    await expect.poll(() => patchBody).toEqual({ category_id: nextCategory.id });
    await expect(page.getByRole('table').getByText(nextCategory.name, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: `Editar categoría de ${mockCatalog.products[0].name}` })).toBeVisible();
  });
});
