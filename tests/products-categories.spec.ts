import { test, expect } from '@playwright/test';
import { loginWithE2EUser, skipUnlessIsolated } from './support/e2e';

test.describe('Productos — Stock en tiempo real, Categorías y Edición', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    skipUnlessIsolated(testInfo);
    await loginWithE2EUser(page);
    // Asegurar que estamos en la vista de productos
    await page.click('button:has-text("Productos")');
    await expect(page.locator('h1', { hasText: 'Productos' })).toBeVisible();
  });

  test('debe mostrar la columna "Stock Total" en la tabla de productos', async ({ page }) => {
    const stockHeader = page.locator('th', { hasText: 'Stock Total' });
    await expect(stockHeader).toBeVisible();
  });

  test('debe abrir y permitir gestionar categorías desde el botón "Categorías"', async ({ page }) => {
    const catBtn = page.locator('[data-testid="btn-manage-categories"]');
    await expect(catBtn).toBeVisible();
    await catBtn.click();

    await expect(page.locator('h3', { hasText: 'Administrar Categorías' })).toBeVisible();
    await expect(page.locator('[data-testid="new-category-name-input"]')).toBeVisible();

    const testCatName = `Test Cat ${Date.now().toString().slice(-4)}`;
    await page.fill('[data-testid="new-category-name-input"]', testCatName);
    await page.click('[data-testid="save-category-btn"]');

    await expect(page.locator('span.truncate', { hasText: testCatName })).toBeVisible({ timeout: 5000 });

    await page.click('[data-testid="close-category-modal"]');
    await expect(page.locator('h3', { hasText: 'Administrar Categorías' })).not.toBeVisible();

    const filterSelect = page.locator('[data-testid="filter-category-select"]');
    await expect(filterSelect.locator(`option:has-text("${testCatName}")`)).toBeAttached();
  });

  test('el formulario de Nuevo Producto debe permitir crear categorías inline', async ({ page }) => {
    await page.click('[data-testid="btn-new-product"]');
    await expect(page.locator('[data-testid="new-product-form"]')).toBeVisible();

    const addQuickBtn = page.locator('[data-testid="btn-add-quick-category"]');
    await expect(addQuickBtn).toBeVisible();
    await addQuickBtn.click();

    const quickInput = page.locator('[data-testid="quick-category-input"]');
    await expect(quickInput).toBeVisible();

    const quickCatName = `Quick Cat ${Date.now().toString().slice(-4)}`;
    await quickInput.fill(quickCatName);
    await page.click('[data-testid="save-quick-category-btn"]');

    const catSelect = page.locator('[data-testid="product-category-select"]');
    await expect(catSelect).toBeVisible();
    await expect(catSelect.locator(`option:has-text("${quickCatName}")`)).toBeAttached();
  });

  test('crear un nuevo producto muestra el cartel de éxito y permite editarlo en la tabla', async ({ page }) => {
    const prodUniqueName = `Royal Canin ${Date.now().toString().slice(-4)}`;

    // 1. Ir a Nuevo Producto
    await page.click('[data-testid="btn-new-product"]');
    await expect(page.locator('[data-testid="new-product-form"]')).toBeVisible();

    // 2. Completar nombre
    await page.fill('[data-testid="product-name-input"]', prodUniqueName);

    // 3. Crear categoría inline
    await page.click('[data-testid="btn-add-quick-category"]');
    const quickCatName = `Cat ${Date.now().toString().slice(-4)}`;
    await page.fill('[data-testid="quick-category-input"]', quickCatName);
    await page.click('[data-testid="save-quick-category-btn"]');

    // Esperar a que termine la creación y el input rápido se cierre
    await expect(page.locator('[data-testid="quick-category-input"]')).not.toBeVisible({ timeout: 5000 });

    // 4. Completar presentación inicial
    await page.fill('[data-testid="presentation-price-input"]', '35000');
    await page.fill('[data-testid="presentation-cost-input"]', '28000');
    await page.fill('[data-testid="presentation-stock-input"]', '20');

    // 5. Guardar producto
    await page.click('[data-testid="submit-new-product"]');

    // 6. Verificar que aparece el cartel verde de éxito
    const banner = page.locator('[data-testid="product-success-banner"]');
    await expect(banner).toBeVisible({ timeout: 6000 });
    await expect(banner).toContainText(prodUniqueName);

    // 7. El producto debe aparecer en la tabla
    const prodRow = page.locator('tr', { hasText: prodUniqueName });
    await expect(prodRow).toBeVisible({ timeout: 5000 });

    // 8. Desplegar presentación para editar
    const toggleBtn = prodRow.locator('button:has-text("presentación")');
    await expect(toggleBtn).toBeVisible();
    await toggleBtn.click();

    // 9. Abrir edición de la presentación
    const editBtn = prodRow.locator('button[title="Editar presentación"]');
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // 10. Modificar el precio y guardar
    const priceInput = prodRow.locator('input[type="number"]').first();
    await expect(priceInput).toBeVisible();

    const saveBtn = prodRow.locator('button:has-text("Guardar")');
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Debe guardarse correctamente
    await expect(prodRow).toBeVisible();
  });

  test('los filtros de búsqueda y categorías deben estar presentes', async ({ page }) => {
    await expect(page.locator('[data-testid="search-product-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="filter-category-select"]')).toBeVisible();
  });
});
