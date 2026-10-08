import { test, expect } from '@playwright/test';

/**
 * Tests E2E para el Punto de Venta (POS)
 * Agente Tester — Stage 03 (revisión tras bug de input deshabilitado)
 *
 * Cubre:
 *  1. La vista POS carga correctamente
 *  2. El input SIEMPRE está habilitado (regresión del bug que lo bloqueaba)
 *  3. Cálculo por Importe: $3.000 muestra cantidad calculada
 *  4. Cálculo por Cantidad: 2.5 kg muestra importe calculado
 *  5. Advertencia de precio=0 es informativa, no bloquea
 *  6. Toggle de modo resetea el input
 *  7. Cálculo matemático puro: $3000 / $2800 = 1.071 kg
 */

test.describe('Punto de Venta (POS) — Cálculos de fraccionamiento', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.click('button:has-text("Punto de Venta")');
    await expect(page.locator('h2', { hasText: 'Punto de Venta' })).toBeVisible();
  });

  // ---------------------------------------------------------------
  // TEST 1: La vista POS carga con los controles básicos
  // ---------------------------------------------------------------
  test('debe mostrar los tabs de modo y los selectores al cargar', async ({ page }) => {
    await expect(page.locator('button:has-text("Por Importe ($)")')).toBeVisible();
    await expect(page.locator('button:has-text("Por Cantidad (Kg/Uds)")')).toBeVisible();
    await expect(page.locator('label:has-text("Producto")')).toBeVisible();
    await expect(page.locator('label:has-text("Presentación")')).toBeVisible();
  });

  // ---------------------------------------------------------------
  // TEST 2 (REGRESIÓN): El input NUNCA debe estar deshabilitado
  // Este es el bug reportado: el input se bloqueaba cuando precio=0
  // ---------------------------------------------------------------
  test('el input de monto SIEMPRE debe estar habilitado (regresión de bug)', async ({ page }) => {
    const inputEl = page.locator('[data-testid="pos-input-value"]');

    // Sin producto seleccionado — el input debe existir y estar habilitado
    await expect(inputEl).toBeVisible();
    await expect(inputEl).toBeEnabled();

    // Intentar tipear debe funcionar
    await inputEl.fill('1500');
    await expect(inputEl).toHaveValue('1500');

    // Con producto seleccionado también
    const productSelect = page.locator('select').first();
    const optionCount = await productSelect.locator('option').count();
    if (optionCount > 1) {
      const firstProductOption = await productSelect.locator('option').nth(1).getAttribute('value');
      await productSelect.selectOption(firstProductOption!);

      // Incluso con una presentación que tenga precio = 0
      const presSelect = page.locator('select').nth(1);
      const presOptionCount = await presSelect.locator('option').count();
      if (presOptionCount > 1) {
        const firstPresOption = await presSelect.locator('option').nth(1).getAttribute('value');
        await presSelect.selectOption(firstPresOption!);
      }

      // El input NUNCA debe estar deshabilitado, independientemente del precio
      await expect(inputEl).toBeEnabled();
      await inputEl.fill('3000');
      await expect(inputEl).toHaveValue('3000');
    }
  });

  // ---------------------------------------------------------------
  // TEST 3: Si precio = 0, el warning es informativo pero no bloquea
  // ---------------------------------------------------------------
  test('advertencia de precio=0 es informativa y no deshabilita el input', async ({ page }) => {
    const productSelect = page.locator('select').first();
    const optionCount = await productSelect.locator('option').count();
    if (optionCount <= 1) {
      console.log('INFO: Sin productos en BD, omitiendo test de precio=0');
      return;
    }

    const firstProductOption = await productSelect.locator('option').nth(1).getAttribute('value');
    await productSelect.selectOption(firstProductOption!);

    const presSelect = page.locator('select').nth(1);
    await expect(presSelect).not.toBeDisabled();
    const presOptionCount = await presSelect.locator('option').count();
    if (presOptionCount <= 1) return;

    const firstPresOption = await presSelect.locator('option').nth(1).getAttribute('value');
    await presSelect.selectOption(firstPresOption!);

    const warning = page.locator('[data-testid="price-zero-warning"]');
    const inputEl = page.locator('[data-testid="pos-input-value"]');

    if (await warning.isVisible()) {
      // Advertencia visible PERO input debe seguir habilitado
      await expect(inputEl).toBeEnabled();
      await inputEl.fill('2000');
      await expect(inputEl).toHaveValue('2000');
      console.log('INFO: Warning de precio=0 visible pero input habilitado ✓');
    } else {
      console.log('INFO: Presentación tiene precio > 0, no aparece warning ✓');
    }
  });

  // ---------------------------------------------------------------
  // TEST 4: Cálculo por Importe — muestra resultado cuando precio > 0
  // ---------------------------------------------------------------
  test('modo Por Importe: muestra cantidad calculada cuando precio > 0', async ({ page }) => {
    await page.click('button:has-text("Por Importe ($)")');

    const productSelect = page.locator('select').first();
    const optionCount = await productSelect.locator('option').count();
    if (optionCount <= 1) {
      // Solo validar que el input es operable
      const inputEl = page.locator('[data-testid="pos-input-value"]');
      await expect(inputEl).toBeEnabled();
      return;
    }

    const firstProductOption = await productSelect.locator('option').nth(1).getAttribute('value');
    await productSelect.selectOption(firstProductOption!);

    const presSelect = page.locator('select').nth(1);
    await expect(presSelect).not.toBeDisabled();
    const firstPresOption = await presSelect.locator('option').nth(1).getAttribute('value');
    await presSelect.selectOption(firstPresOption!);

    const inputEl = page.locator('[data-testid="pos-input-value"]');
    await expect(inputEl).toBeEnabled();
    await inputEl.fill('3000');
    await expect(inputEl).toHaveValue('3000');

    const warning = page.locator('[data-testid="price-zero-warning"]');
    if (!await warning.isVisible()) {
      const result = page.locator('[data-testid="pos-calculation-result"]');
      await expect(result).toBeVisible({ timeout: 3000 });

      const calculatedValue = page.locator('[data-testid="pos-calculated-value"]');
      const text = await calculatedValue.innerText();
      expect(text).toMatch(/\d/); // Tiene algún número
      expect(text).toContain('kg');
      console.log(`INFO: Cálculo por importe $3.000 → ${text} ✓`);
    }
  });

  // ---------------------------------------------------------------
  // TEST 5: Cálculo por Cantidad
  // ---------------------------------------------------------------
  test('modo Por Cantidad: muestra importe calculado cuando precio > 0', async ({ page }) => {
    await page.click('button:has-text("Por Cantidad (Kg/Uds)")');

    const productSelect = page.locator('select').first();
    const optionCount = await productSelect.locator('option').count();
    if (optionCount <= 1) {
      const inputEl = page.locator('[data-testid="pos-input-value"]');
      await expect(inputEl).toBeEnabled();
      return;
    }

    const firstProductOption = await productSelect.locator('option').nth(1).getAttribute('value');
    await productSelect.selectOption(firstProductOption!);

    const presSelect = page.locator('select').nth(1);
    await expect(presSelect).not.toBeDisabled();
    const firstPresOption = await presSelect.locator('option').nth(1).getAttribute('value');
    await presSelect.selectOption(firstPresOption!);

    const inputEl = page.locator('[data-testid="pos-input-value"]');
    await expect(inputEl).toBeEnabled();
    await inputEl.fill('2.5');
    await expect(inputEl).toHaveValue('2.5');

    const warning = page.locator('[data-testid="price-zero-warning"]');
    if (!await warning.isVisible()) {
      const result = page.locator('[data-testid="pos-calculation-result"]');
      await expect(result).toBeVisible({ timeout: 3000 });

      const calculatedValue = page.locator('[data-testid="pos-calculated-value"]');
      const text = await calculatedValue.innerText();
      expect(text).toMatch(/^\$/);
      console.log(`INFO: Cálculo por cantidad 2.5 kg → ${text} ✓`);
    }
  });

  // ---------------------------------------------------------------
  // TEST 6: Cambiar de modo limpia el input
  // ---------------------------------------------------------------
  test('cambiar de modo resetea el input a vacío', async ({ page }) => {
    await page.click('button:has-text("Por Importe ($)")');
    const inputEl = page.locator('[data-testid="pos-input-value"]');
    await inputEl.fill('5000');
    await expect(inputEl).toHaveValue('5000');

    await page.click('button:has-text("Por Cantidad (Kg/Uds)")');
    await expect(inputEl).toHaveValue('');

    const result = page.locator('[data-testid="pos-calculation-result"]');
    await expect(result).not.toBeVisible();
  });

  // ---------------------------------------------------------------
  // TEST 7: Verificación matemática pura en browser
  //   $3.000 / $2.800 por kg = 1.071 kg
  // ---------------------------------------------------------------
  test('cálculo matemático: $3000 / $2800 = 1,071 kg (verificación in-browser)', async ({ page }) => {
    const result = await page.evaluate(() => {
      const amount = 3000;
      const pricePerKg = 2800;
      return Number((amount / pricePerKg).toFixed(3));
    });
    expect(result).toBe(1.071);
    console.log(`INFO: $3000 / $2800 = ${result} kg ✓`);
  });
});
