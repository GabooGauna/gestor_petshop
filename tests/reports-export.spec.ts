import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { installMockBackend, loginWithMockUser, mockCatalog, mockProfitabilityDetail } from './support/e2e';

test.describe('Reportes — exportación y filtros', () => {
  test.beforeEach(async ({ page }) => {
    await installMockBackend(page);
    await loginWithMockUser(page);
    await page.getByRole('button', { name: 'Reportes' }).click();
    await expect(page.getByRole('heading', { name: 'Reportes' })).toBeVisible();
  });

  test('exporta rentabilidad con el diseño de detalle y medio de pago', async ({ page }) => {
    await expect(page.getByTestId('export-report')).toBeEnabled();
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-report').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^avenida-animal-rentabilidad_\d{2}-\d{2}-\d{2}_a_\d{2}-\d{2}-\d{2}\.xlsx$/);
    const path = await download.path();
    expect(path).not.toBeNull();
    if (!path) return;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await readFile(path));
    expect(workbook.creator).toBe('Avenida Animal');
    expect(workbook.title).toBe('Avenida Animal - Rentabilidad');
    expect(workbook.company).toBe('Avenida Animal');
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual(['Rentabilidad']);
    const sheet = workbook.getWorksheet('Rentabilidad');
    expect(sheet).toBeDefined();
    if (!sheet) return;
    expect(sheet.getCell('A1').value).toBe('DETALLE DE RENTABILIDAD');
    expect(sheet.getCell('C1').value).toBe('PRODUCTOS / MEDIOS DE PAGO');
    expect(sheet.getCell('A2').value).toBe('Período');
    expect(sheet.getCell('B2').value).toBe('Fecha de venta');
    expect(sheet.getCell('A3').value).toMatch(/^\d{2}\/\d{2}\/\d{4} - \d{2}\/\d{2}\/\d{4}$/);
    expect(sheet.getCell('B3').value).toBeInstanceOf(Date);
    expect((sheet.getCell('B3').value as Date).toISOString()).toBe('2026-10-10T10:30:00.000Z');
    expect(sheet.getCell('B3').numFmt).toBe('dd/mm/yyyy hh:mm');
    expect(sheet.getCell('C3').value).toBe(mockProfitabilityDetail[0].product_name);
    expect(sheet.getCell('D3').value).toBe(mockProfitabilityDetail[0].presentation_name);
    expect(sheet.getCell('H3').value).toBe(245000);
    expect(sheet.getCell('H3').numFmt).toBe('"$" #,##0.00');
    expect(sheet.getCell('J3').fill).toMatchObject({ fgColor: { argb: 'FFDDF4E8' } });
    expect(sheet.getCell('K3').value).toBeCloseTo(0.3143);
    expect(sheet.getCell('K3').numFmt).toBe('0.00%');
    expect(sheet.getCell('L3').value).toBe('Efectivo');
    expect(sheet.getCell('L3').fill).toMatchObject({ fgColor: { argb: 'FFEFF5FC' } });
    expect(sheet.getCell('A4').value).toBe(sheet.getCell('A3').value);
    expect(sheet.getCell('B4').value).toBeInstanceOf(Date);
    expect(JSON.stringify(sheet.autoFilter)).toContain('A2');
    expect(JSON.stringify(sheet.autoFilter)).toContain('L4');
  });

  test('métodos de pago queda como información sin exportación propia', async ({ page }) => {
    await page.getByRole('tab', { name: 'Métodos de pago' }).click();
    await expect(page.getByText('Efectivo', { exact: true })).toBeVisible();
    await expect(page.getByTestId('export-report')).toHaveCount(0);
  });

  test('exporta movimientos con unidades enteras y peso con tres decimales', async ({ page }) => {
    await page.getByRole('tab', { name: 'Movimientos' }).click();
    await expect(page.getByTestId('export-report')).toBeEnabled();
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-report').click();
    const download = await downloadPromise;

    const path = await download.path();
    expect(path).not.toBeNull();
    if (!path) return;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await readFile(path));
    const sheet = workbook.getWorksheet('Movimientos');
    expect(sheet).toBeDefined();
    if (!sheet) return;

    expect(sheet.getCell('E5').value).toBe(-2.5);
    expect(sheet.getCell('E5').numFmt).toBe('#,##0.000');
    expect(sheet.getCell('F5').value).toBe('kg');
    expect(sheet.getCell('E6').value).toBe(-1);
    expect(sheet.getCell('E6').numFmt).toBe('#,##0');
    expect(sheet.getCell('F6').value).toBe('uds');
    expect(sheet.getCell('G4').value).toBe('Motivo');
    expect(sheet.getCell('G5').value).toBe('Venta');
    expect(sheet.getCell('G6').value).toBe('Venta unitaria QA');
    expect(sheet.getCell('H4').value).toBeNull();
    expect(JSON.stringify(sheet.autoFilter)).toContain('G6');
  });

  test('aplica tipo y producto solamente al confirmar los filtros', async ({ page }) => {
    let movementRequests = 0;
    await page.route('**/rest/v1/rpc/get_inventory_movement_report', async route => {
      movementRequests += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total_count: 0, items: [] }) });
    });

    await page.getByRole('tab', { name: 'Movimientos' }).click();
    await expect.poll(() => movementRequests).toBe(1);
    await page.getByLabel('Tipo de movimiento').selectOption('venta');
    await page.getByLabel('Producto').selectOption(mockCatalog.products[0].id);
    await page.waitForLoadState('networkidle');
    expect(movementRequests).toBe(1);

    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    await expect.poll(() => movementRequests).toBe(2);
  });
});

