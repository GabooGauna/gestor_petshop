import { test, expect } from '@playwright/test';

test.describe('Sanidad del Entorno', () => {
    test('debe cargar la aplicación web y verificar que el servidor React/Vite responda', async ({ page }) => {
        // Navega a la raíz usando la baseURL configurada (http://localhost:5173)
        await page.goto('/');

        // Verifica que el título o contenedor principal exista
        await expect(page).toHaveTitle('Avenida Animal');
    });
});
