import { expect, test } from '@playwright/test';
import { installMockBackend, loginWithE2EUser, loginWithMockUser, skipUnlessRealAuth } from './support/e2e';

test.describe('Autenticación', () => {
  test('un visitante anónimo solo ve el acceso y no la aplicación', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Avenida Animal');
    await expect(page.getByRole('heading', { name: 'Avenida Animal' })).toBeVisible();
    const favicon = page.locator('link[rel="icon"]');
    await expect(favicon).toHaveAttribute('href', '/favicon.svg');
    const faviconResponse = await page.request.get('/favicon.svg');
    expect(faviconResponse.ok()).toBeTruthy();
    expect(await faviconResponse.text()).toContain('<title>Avenida Animal</title>');
    await expect(page.getByLabel('Correo')).toBeVisible();
    await expect(page.getByLabel('Contraseña')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Punto de Venta' })).not.toBeVisible();
  });

  test('completa login, sesión y cierre sin credenciales hardcodeadas', async ({ page }) => {
    await installMockBackend(page);
    await loginWithMockUser(page);
    await expect(page.getByRole('button', { name: 'Productos', exact: true })).toBeVisible();
    await page.route('**/auth/v1/logout*', route => route.fulfill({ status: 204, body: '' }));
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
  });

  test('login real del usuario E2E provisionado', async ({ page }, testInfo) => {
    skipUnlessRealAuth(testInfo);
    await loginWithE2EUser(page);
    await expect(page.getByRole('button', { name: 'Productos', exact: true })).toBeVisible();
  });

  test('ubica el cierre de sesión dentro del menú hamburguesa en móvil', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installMockBackend(page);
    await loginWithMockUser(page);
    await page.route('**/auth/v1/logout*', route => route.fulfill({ status: 204, body: '' }));

    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).not.toBeVisible();
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    const navigation = page.locator('aside[aria-label="Navegación principal"]');
    await expect(navigation.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
    await navigation.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
  });
});
