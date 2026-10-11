import { expect, test } from '@playwright/test';
import { installMockBackend, loginWithMockUser } from './support/e2e';

test.describe('Configuración de apariencia', () => {
  test('activa el modo oscuro y conserva la preferencia al recargar', async ({ page }) => {
    await installMockBackend(page);
    await loginWithMockUser(page);

    await page.getByRole('button', { name: 'Configuración' }).click();
    await page.getByRole('button', { name: /Modo oscuro/ }).click();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('button', { name: /Modo oscuro/ })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('petstock-theme'))).toBe('dark');

    const formBackground = await page.getByRole('dialog').evaluate(element => getComputedStyle(element).backgroundColor);
    expect(formBackground).toBe('rgb(17, 28, 46)');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('heading', { name: 'El pulso de Avenida Animal' })).toBeVisible();
  });

  test('permite cambiar el tema desde Configuración en el menú móvil', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMockBackend(page);
    await loginWithMockUser(page);

    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await page.locator('aside[aria-label="Navegación principal"]').getByRole('button', { name: 'Configuración' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /Modo oscuro/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeVisible();
  });

  test('aplica superficies oscuras en todas las secciones operativas', async ({ page }) => {
    await installMockBackend(page);
    await loginWithMockUser(page);
    await page.getByRole('button', { name: 'Configuración' }).click();
    await page.getByRole('button', { name: /Modo oscuro/ }).click();
    await page.getByRole('button', { name: 'Cerrar configuración' }).click();

    for (const section of ['Inicio', 'Productos', 'Compras', 'Punto de Venta', 'Inventario']) {
      await page.getByRole('button', { name: section, exact: true }).click();
      await expect(page.locator('main')).toBeVisible();

      const whitePanels = await page.locator('.bg-white:visible').evaluateAll(elements => (
        elements.filter(element => getComputedStyle(element).backgroundColor === 'rgb(255, 255, 255)').length
      ));
      expect(whitePanels, `${section} todavía contiene paneles blancos`).toBe(0);

      const lightControls = await page.locator('main input:visible, main select:visible, main textarea:visible').evaluateAll(elements => (
        elements.filter(element => getComputedStyle(element).backgroundColor === 'rgb(255, 255, 255)').length
      ));
      expect(lightControls, `${section} todavía contiene formularios blancos`).toBe(0);
    }
  });

  test('mantiene oscuros los estados hover del inicio', async ({ page }) => {
    await installMockBackend(page);
    await loginWithMockUser(page);
    await page.getByRole('button', { name: 'Configuración' }).click();
    await page.getByRole('button', { name: /Modo oscuro/ }).click();
    await page.getByRole('button', { name: 'Cerrar configuración' }).click();

    const stockDetail = page.getByTestId('low-stock-panel').getByRole('button', { name: 'Ver detalle' });
    await stockDetail.hover();
    await expect.poll(() => stockDetail.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe('rgb(239, 246, 255)');

    const quickSale = page.getByRole('button', { name: 'Nueva venta' });
    await quickSale.hover();
    await expect.poll(() => quickSale.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe('rgb(239, 246, 255)');
  });
});
