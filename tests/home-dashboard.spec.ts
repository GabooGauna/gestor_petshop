import { expect, test } from '@playwright/test';
import { installMockBackend, loginWithMockUser, mockCatalog } from './support/e2e';

test.describe('Inicio — resumen analítico', () => {
  test.beforeEach(async ({ page }) => {
    await installMockBackend(page);
    await loginWithMockUser(page);
  });

  test('muestra los días y el detalle financiero al recorrer el gráfico', async ({ page }) => {
    const chart = page.getByTestId('sales-chart');
    await expect(chart).toBeVisible();
    await expect(chart.getByText('04-oct')).toBeVisible();
    await expect(chart.getByText('10-oct')).toBeVisible();

    const tooltip = page.getByTestId('sales-chart-tooltip');
    await chart.locator('.recharts-line-curve').first().hover({ force: true });
    await expect(tooltip).toBeVisible();
    await expect(tooltip.getByText('Ventas', { exact: true })).toBeVisible();
    await expect(tooltip.getByText('Costo histórico', { exact: true })).toBeVisible();
    await expect(tooltip.getByText('Ganancia bruta estimada', { exact: true })).toBeVisible();
    await expect(tooltip.getByText(/ventas?$/)).toBeVisible();
    await expect(tooltip.getByText(/% de margen$/)).toBeVisible();
  });

  test('permite comparar u ocultar series sin dejar el gráfico vacío', async ({ page }) => {
    const sales = page.getByRole('button', { name: 'Ventas', exact: true });
    const profit = page.getByRole('button', { name: 'Ganancia bruta estimada', exact: true });
    await expect(sales).toHaveAttribute('aria-pressed', 'true');
    await profit.click();
    await expect(profit).toHaveAttribute('aria-pressed', 'false');
    await sales.click();
    await expect(sales).toHaveAttribute('aria-pressed', 'true');
  });

  test('respeta mínimos independientes de 0 a 5 y superiores sin piso preventivo', async ({ page }) => {
    const unitProduct = mockCatalog.products[1];
    const basePresentation = unitProduct.product_presentations[0];
    const variants = [
      { id: '20000000-0000-4000-8000-000000000000', name: 'Mínimo cero disponible', stock: 1, min_stock: 0, status: 'active' },
      { id: '20000000-0000-4000-8000-000000000001', name: 'Mínimo cero agotada', stock: 0, min_stock: 0, status: 'active' },
      { id: '20000000-0000-4000-8000-000000000002', name: 'Mínimo uno', stock: 1, min_stock: 1, status: 'active' },
      { id: '20000000-0000-4000-8000-000000000003', name: 'Mínimo dos disponible', stock: 3, min_stock: 2, status: 'active' },
      { id: '20000000-0000-4000-8000-000000000004', name: 'Mínimo tres', stock: 3, min_stock: 3, status: 'active' },
      { id: '20000000-0000-4000-8000-000000000005', name: 'Mínimo cuatro disponible', stock: 5, min_stock: 4, status: 'active' },
      { id: '20000000-0000-4000-8000-000000000006', name: 'Mínimo cinco', stock: 4, min_stock: 5, status: 'active' },
      { id: '20000000-0000-4000-8000-000000000007', name: 'Mínimo ocho', stock: 8, min_stock: 8, status: 'active' },
      { id: '20000000-0000-4000-8000-000000000008', name: 'Archivada agotada', stock: 0, min_stock: 10, status: 'inactive' },
    ].map(variant => ({ ...basePresentation, ...variant }));
    await page.route('**/rest/v1/products*', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockCatalog.products.map(product => (
        product.id === unitProduct.id
          ? {
              ...product,
              product_presentations: variants,
            }
          : product
      ))),
    }));
    await page.reload();

    const panel = page.getByTestId('low-stock-panel');
    await expect(panel).toContainText('5');
    await expect(panel).toContainText('Correa QA');
    await expect(panel).toContainText('Mínimo cero agotada');
    await expect(panel).toContainText('Disponible: 0 uds · Mínimo: 0 uds');
    await expect(panel).toContainText('Agotado');
    await expect(panel).toContainText('Mínimo uno');
    await expect(panel).toContainText('Mínimo tres');
    await expect(panel).toContainText('Mínimo cinco');
    await expect(panel).toContainText('Mínimo ocho');
    await expect(panel).toContainText('Queda poco');
    await expect(panel).not.toContainText('Mínimo cero disponible');
    await expect(panel).not.toContainText('Mínimo dos disponible');
    await expect(panel).not.toContainText('Mínimo cuatro disponible');
    await expect(panel).not.toContainText('Archivada agotada');

    await panel.getByRole('button', { name: `Abrir producto ${unitProduct.name}` }).first().click();
    await expect(page.getByTestId(`product-row-${unitProduct.id}`)).toBeVisible();
    await expect(page.getByTestId(`presentation-${variants[1].id}`)).toBeVisible();
  });

  test('permite navegar desde Inicio a las tareas frecuentes', async ({ page }) => {
    await page.getByRole('button', { name: 'Nueva venta' }).click();
    await expect(page.getByRole('heading', { name: 'Punto de venta' })).toBeVisible();
    await page.getByRole('button', { name: 'Inicio' }).click();
    await page.getByRole('button', { name: 'Registrar compra' }).click();
    await expect(page.getByRole('heading', { name: /Registrar compra/i })).toBeVisible();
  });

  test('recupera automáticamente las métricas después de fallos transitorios', async ({ page }) => {
    let attempts = 0;
    await page.route('**/rest/v1/rpc/get_dashboard_analytics', async route => {
      attempts += 1;
      if (attempts < 3) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'TEMPORARY_UNAVAILABLE', message: 'Service temporarily unavailable' }),
        });
        return;
      }
      await route.fallback();
    });

    await page.reload();

    await expect(page.getByTestId('analytics-dashboard')).toBeVisible();
    await expect(page.getByTestId('dashboard-error')).toHaveCount(0);
    await expect.poll(() => attempts).toBe(3);
  });

  test('mantiene el reintento manual cuando se agotan los intentos automáticos', async ({ page }) => {
    let unavailable = true;
    let attempts = 0;
    await page.route('**/rest/v1/rpc/get_dashboard_analytics', async route => {
      attempts += 1;
      if (unavailable) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'TEMPORARY_UNAVAILABLE', message: 'Service temporarily unavailable' }),
        });
        return;
      }
      await route.fallback();
    });

    await page.reload();

    await expect(page.getByTestId('dashboard-error')).toBeVisible();
    await expect.poll(() => attempts).toBe(3);

    unavailable = false;
    await page.getByRole('button', { name: 'Reintentar' }).click();

    await expect(page.getByTestId('analytics-dashboard')).toBeVisible();
    await expect.poll(() => attempts).toBe(4);
  });
});
