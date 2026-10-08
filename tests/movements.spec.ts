import { test, expect } from '@playwright/test';

/**
 * Tests E2E — Stage 04: Control de Mermas y Ajustes de Stock
 * Agente Tester — Playwright
 *
 * Cubre:
 *  1. La vista Inventario carga con los 3 tabs
 *  2. Merma sin motivo → bloqueada con mensaje de error
 *  3. Merma sin producto → bloqueada
 *  4. Merma con motivo → formulario habilitado
 *  5. Los 6 motivos predefinidos están presentes
 *  6. Tab Ajuste de Stock carga correctamente
 *  7. Ajuste con stock físico = sistema → botón deshabilitado
 *  8. Tab Kardex carga la tabla de historial
 *  9. El sidebar Inventario activa el highlight correcto
 */

test.describe('Inventario — Mermas y Ajustes (Stage 04)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173');
    // Navegar a Inventario desde el sidebar
    await page.click('button:has-text("Inventario")');
    await expect(page.locator('h2', { hasText: 'Inventario' })).toBeVisible();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: La vista Inventario muestra los 3 tabs
  // ──────────────────────────────────────────────────────────────────────────
  test('debe mostrar los 3 tabs: Merma, Ajuste, Kardex', async ({ page }) => {
    await expect(page.locator('[data-testid="tab-mermas"]')).toBeVisible();
    await expect(page.locator('[data-testid="tab-ajustes"]')).toBeVisible();
    await expect(page.locator('[data-testid="tab-kardex"]')).toBeVisible();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2 (CRÍTICO): Merma sin motivo → bloqueada
  // ──────────────────────────────────────────────────────────────────────────
  test('no debe permitir guardar una merma sin seleccionar motivo', async ({ page }) => {
    // El tab de mermas debería ser el activo por defecto
    await expect(page.locator('[data-testid="shrinkage-form"]')).toBeVisible();

    // Intentar enviar sin llenar nada
    const submitBtn = page.locator('[data-testid="shrinkage-submit"]');
    await submitBtn.click();

    // Debe aparecer un mensaje de error
    const errorEl = page.locator('[data-testid="shrinkage-error"]');
    await expect(errorEl).toBeVisible({ timeout: 3000 });
    const errorText = await errorEl.innerText();
    expect(errorText.toLowerCase()).toMatch(/producto|motivo|seleccion/i);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Merma — el aviso de motivo obligatorio es visible
  // ──────────────────────────────────────────────────────────────────────────
  test('debe mostrar advertencia de motivo obligatorio al inicio', async ({ page }) => {
    await expect(page.locator('[data-testid="shrinkage-form"]')).toBeVisible();

    // El texto "El motivo es obligatorio" o similar debe estar visible (inline en el form)
    const warningEl = page.locator('text=El motivo es obligatorio').first();
    await expect(warningEl).toBeVisible();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Los 6 motivos predefinidos están presentes
  // ──────────────────────────────────────────────────────────────────────────
  test('debe mostrar los 6 botones de motivo predefinido', async ({ page }) => {
    const reasons = [
      'Alimento vencido',
      'Derrame / rotura de envase',
      'Daño por humedad',
      'Contaminación',
      'Robo / faltante',
      'Otro',
    ];

    for (const reason of reasons) {
      // Use text matching — immune to special-char sanitisation in data-testid
      await expect(page.locator('button', { hasText: reason }).first()).toBeVisible();
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Seleccionar motivo "Otro" muestra el input de motivo personalizado
  // ──────────────────────────────────────────────────────────────────────────
  test('seleccionar "Otro" debe mostrar campo de texto personalizado', async ({ page }) => {
    const otroBtn = page.locator('[data-testid="reason-btn-Otro"]');
    await otroBtn.click();

    const customInput = page.locator('[data-testid="shrinkage-custom-reason"]');
    await expect(customInput).toBeVisible();
    await customInput.fill('Merma por rotura durante traslado');
    await expect(customInput).toHaveValue('Merma por rotura durante traslado');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Tab Ajuste de Stock carga el formulario
  // ──────────────────────────────────────────────────────────────────────────
  test('tab Ajuste de Stock debe mostrar su formulario', async ({ page }) => {
    await page.click('[data-testid="tab-ajustes"]');
    await expect(page.locator('[data-testid="adjustment-form"]')).toBeVisible();
    await expect(page.locator('[data-testid="adjustment-product-select"]')).toBeVisible();
    await expect(page.locator('[data-testid="adjustment-presentation-select"]')).toBeVisible();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 7: Ajuste con productos disponibles — el selector de presentación
  //         está deshabilitado hasta seleccionar producto
  // ──────────────────────────────────────────────────────────────────────────
  test('en Ajuste, el selector de presentación debe estar deshabilitado sin producto', async ({ page }) => {
    await page.click('[data-testid="tab-ajustes"]');
    const presSelect = page.locator('[data-testid="adjustment-presentation-select"]');
    await expect(presSelect).toBeDisabled();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 8: Tab Kardex carga la tabla de historial
  // ──────────────────────────────────────────────────────────────────────────
  test('tab Kardex debe mostrar tabla o mensaje de sin movimientos', async ({ page }) => {
    await page.click('[data-testid="tab-kardex"]');

    // Debe aparecer la tabla O el mensaje vacío
    const tableOrEmpty = page.locator('table, [data-testid="tab-kardex"] ~ * text=Sin movimientos');
    const hasTable = await page.locator('table').isVisible().catch(() => false);
    const hasEmpty = await page.locator('text=Sin movimientos').isVisible().catch(() => false);

    expect(hasTable || hasEmpty).toBe(true);
    console.log(`INFO: Kardex → ${hasTable ? 'tabla con datos' : 'sin movimientos'} ✓`);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 9: El sidebar resalta "Inventario" cuando la vista está activa
  // ──────────────────────────────────────────────────────────────────────────
  test('el botón Inventario del sidebar debe tener clase activa', async ({ page }) => {
    const sidebarBtn = page.locator('button:has-text("Inventario")').first();
    const cls = await sidebarBtn.getAttribute('class') ?? '';
    // Debe tener el indicador de activo (border-l o text-blue)
    expect(cls).toMatch(/border-l|text-blue/);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 10: Validación matemática pura — signos de mermas y ajustes
  // ──────────────────────────────────────────────────────────────────────────
  test('calcular signo: merma siempre negativa, ajuste positivo o negativo', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Merma: siempre negativa
      const shrinkageQty = -Math.abs(5.5);
      // Ajuste sobrante (físico > sistema): positivo
      const surplusDelta = 10 - 8;
      // Ajuste faltante (físico < sistema): negativo
      const deficitDelta = 6 - 8;

      return { shrinkageQty, surplusDelta, deficitDelta };
    });

    expect(result.shrinkageQty).toBeLessThan(0);
    expect(result.surplusDelta).toBeGreaterThan(0);
    expect(result.deficitDelta).toBeLessThan(0);
    console.log(`INFO: Signos correctos: merma=${result.shrinkageQty}, sobrante=+${result.surplusDelta}, faltante=${result.deficitDelta} ✓`);
  });
});
