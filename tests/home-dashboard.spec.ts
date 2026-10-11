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

    const plot = chart.locator('.recharts-wrapper');
    const box = await plot.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    await page.mouse.move(box.x + box.width * 0.58, box.y + box.height * 0.45);

    const tooltip = page.getByTestId('sales-chart-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip.getByText('Ventas', { exact: true })).toBeVisible();
    await expect(tooltip.getByText('Costo', { exact: true })).toBeVisible();
    await expect(tooltip.getByText('Ganancia', { exact: true })).toBeVisible();
    await expect(tooltip.getByText(/ventas?$/)).toBeVisible();
    await expect(tooltip.getByText(/% de margen$/)).toBeVisible();
  });

  test('permite comparar u ocultar series sin dejar el gráfico vacío', async ({ page }) => {
    const sales = page.getByRole('button', { name: 'Ventas', exact: true });
    const profit = page.getByRole('button', { name: 'Ganancia', exact: true });
    await expect(sales).toHaveAttribute('aria-pressed', 'true');
    await profit.click();
    await expect(profit).toHaveAttribute('aria-pressed', 'false');
    await sales.click();
    await expect(sales).toHaveAttribute('aria-pressed', 'true');
  });

  test('alerta por presentación antes de que el stock se agote', async ({ page }) => {
    const unitProduct = mockCatalog.products[1];
    await page.route('**/rest/v1/products*', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockCatalog.products.map(product => (
        product.id === unitProduct.id
          ? {
              ...product,
              product_presentations: [
                product.product_presentations[0],
                {
                  ...product.product_presentations[0],
                  id: '20202020-2020-4020-8020-202020202020',
                  name: 'Mediana',
                  stock: 0,
                },
                {
                  ...product.product_presentations[0],
                  id: '21212121-2121-4121-8121-212121212121',
                  name: 'Corta',
                  stock: 4,
                },
              ],
            }
          : product
      ))),
    }));
    await page.reload();

    const panel = page.getByTestId('low-stock-panel');
    await expect(panel).toContainText('2');
    await expect(panel).toContainText('Correa QA');
    await expect(panel).toContainText('Mediana · Reponer desde 5 uds');
    await expect(panel).toContainText('0 uds');
    await expect(panel).toContainText('Agotado');
    await expect(panel).toContainText('Corta · Reponer desde 5 uds');
    await expect(panel).toContainText('4 uds');
    await expect(panel).toContainText('Queda poco');
    await expect(panel).not.toContainText('Unidad · Reponer');
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
