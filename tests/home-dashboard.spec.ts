import { expect, test } from '@playwright/test';
import { installMockBackend, loginWithMockUser } from './support/e2e';

test.describe('Inicio — resumen operativo de stock', () => {
  test.beforeEach(async ({ page }) => {
    await installMockBackend(page);
    await loginWithMockUser(page);
  });

  test('muestra el stock general sin mezclar kilos y unidades', async ({ page }) => {
    await expect(page.getByTestId('stock-overview')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Estado del stock' })).toBeVisible();
    await expect(page.getByText('Alimento QA')).toBeVisible();
    await expect(page.getByText('200 kg')).toBeVisible();
    await expect(page.getByText('Correa QA')).toBeVisible();
    await expect(page.getByText('15 uds')).toBeVisible();
  });

  test('permite navegar desde Inicio a las tareas frecuentes', async ({ page }) => {
    await page.getByRole('button', { name: 'Abrir punto de venta' }).click();
    await expect(page.getByRole('heading', { name: 'Punto de venta' })).toBeVisible();
    await page.getByRole('button', { name: 'Inicio' }).click();
    await page.getByRole('button', { name: 'Registrar compra' }).click();
    await expect(page.getByRole('heading', { name: /Registrar compra/i })).toBeVisible();
  });
});
