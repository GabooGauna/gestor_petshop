import { formatMovementReason, movementLabels, paymentLabels } from '../lib/reportFormatting';
import type {
  InventoryMovementReportItem, MovementType, ProductProfitabilityDetail, ReportDateRange,
} from './reportService';

interface ExportBase {
  range: ReportDateRange;
}

export type ReportExportInput =
  | (ExportBase & { kind: 'profitability'; rows: ProductProfitabilityDetail[] })
  | (ExportBase & {
      kind: 'movements';
      rows: InventoryMovementReportItem[];
      movementType?: MovementType;
      productName?: string;
    });

const NAVY = 'FF16324F';
const HEADER_NAVY = 'FF193C5C';
const TEAL = 'FF126B79';
const TEXT = 'FF172D43';
const MUTED = 'FF52677A';
const BORDER = 'FFD7E1EA';
const WHITE = 'FFFFFFFF';
const ROW_ALT = 'FFF8FAFC';
const PROFIT_FILL = 'FFDDF4E8';
const PROFIT_TEXT = 'FF008048';
const LOSS_FILL = 'FFFDE8E8';
const LOSS_TEXT = 'FFB42318';
const PAYMENT_FILL = 'FFEFF5FC';
const FONT = 'Calibri';
const BUSINESS_TIMEZONE = 'America/Argentina/Buenos_Aires';
const businessDateParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIMEZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function number(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error('PETSTOCK_INVALID_EXPORT_NUMBER');
  return parsed;
}

function date(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('PETSTOCK_INVALID_EXPORT_DATE');
  const parts = Object.fromEntries(
    businessDateParts.formatToParts(parsed)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)]),
  );
  return new Date(Date.UTC(
    parts.year, parts.month - 1, parts.day,
    parts.hour, parts.minute, parts.second,
  ));
}

function displayDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function period(range: ReportDateRange): string {
  return `${displayDate(range.from)} - ${displayDate(range.to)}`;
}

function filenameDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}-${month}-${year.slice(-2)}`;
}

function styleTitle(cell: import('exceljs').Cell, fill: string, size: number): void {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  cell.font = { name: FONT, size, bold: true, color: { argb: WHITE } };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
}

function addProfitabilitySheet(
  workbook: import('exceljs').Workbook,
  input: Extract<ReportExportInput, { kind: 'profitability' }>,
): void {
  const sheet = workbook.addWorksheet('Rentabilidad', {
    views: [{ state: 'frozen', ySplit: 2, showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.columns = [
    { key: 'period', width: 25 }, { key: 'saleDate', width: 23 },
    { key: 'product', width: 31 }, { key: 'presentation', width: 25 },
    { key: 'type', width: 14 }, { key: 'unit', width: 10 }, { key: 'quantity', width: 13 },
    { key: 'revenue', width: 17 }, { key: 'cost', width: 17 }, { key: 'profit', width: 18 },
    { key: 'margin', width: 12 }, { key: 'payment', width: 21 },
  ];
  sheet.mergeCells('A1:B1');
  sheet.mergeCells('C1:L1');
  sheet.getCell('A1').value = 'DETALLE DE RENTABILIDAD';
  sheet.getCell('C1').value = 'PRODUCTOS / MEDIOS DE PAGO';
  styleTitle(sheet.getCell('A1'), NAVY, 11);
  styleTitle(sheet.getCell('C1'), TEAL, 10);
  sheet.getRow(1).height = 28;

  const header = sheet.getRow(2);
  header.values = ['Período', 'Fecha de venta', 'Producto', 'Presentación', 'Tipo', 'Unidad', 'Cantidad', 'Facturación', 'Costo', 'Ganancia bruta', 'Margen', 'Medio de pago'];
  header.height = 25;
  header.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_NAVY } };
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: WHITE } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = { bottom: { style: 'medium', color: { argb: TEAL } } };
  });

  for (const item of input.rows) {
    const grossProfit = number(item.gross_profit);
    const row = sheet.addRow([
      period(input.range), date(item.sale_date), item.product_name, item.presentation_name,
      item.product_type === 'weight' ? 'Por peso' : 'Por unidad', item.unit,
      number(item.stock_quantity), number(item.total_amount),
      number(item.total_cost), grossProfit,
      item.margin_pct === null ? null : number(item.margin_pct) / 100,
      paymentLabels[item.payment_method],
    ]);
    row.height = 23;
    row.eachCell((cell, column) => {
      cell.font = { name: FONT, size: 10, color: { argb: TEXT } };
      cell.alignment = { vertical: 'middle', horizontal: column >= 7 && column <= 11 ? 'right' : 'left' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: row.number % 2 === 0 ? ROW_ALT : WHITE } };
      cell.border = { bottom: { style: 'thin', color: { argb: BORDER } } };
    });
    row.getCell(2).numFmt = 'dd/mm/yyyy hh:mm';
    row.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(7).numFmt = item.product_type === 'weight' ? '#,##0.000' : '#,##0';
    for (const column of [8, 9, 10]) row.getCell(column).numFmt = '"$" #,##0.00';
    row.getCell(11).numFmt = '0.00%';
    for (const column of [10, 11]) {
      const cell = row.getCell(column);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: grossProfit >= 0 ? PROFIT_FILL : LOSS_FILL } };
      cell.font = { name: FONT, size: column === 10 ? 11 : 10, bold: true, color: { argb: grossProfit >= 0 ? PROFIT_TEXT : LOSS_TEXT } };
    }
    row.getCell(12).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAYMENT_FILL } };
  }

  const lastRow = Math.max(sheet.rowCount, 2);
  sheet.autoFilter = { from: 'A2', to: `L${lastRow}` };
  sheet.pageSetup.printArea = `A1:L${lastRow}`;
  sheet.pageSetup.printTitlesRow = '1:2';
  sheet.properties.defaultRowHeight = 21;
}

function addMovementsSheet(
  workbook: import('exceljs').Workbook,
  input: Extract<ReportExportInput, { kind: 'movements' }>,
): void {
  const sheet = workbook.addWorksheet('Movimientos', {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.columns = [
    { width: 20 }, { width: 14 }, { width: 30 }, { width: 24 },
    { width: 14 }, { width: 10 }, { width: 38 },
  ];
  sheet.mergeCells('A1:G1');
  sheet.getCell('A1').value = 'MOVIMIENTOS DE INVENTARIO';
  styleTitle(sheet.getCell('A1'), NAVY, 11);
  sheet.getRow(1).height = 28;
  sheet.addRow(['Período', period(input.range)]);
  sheet.addRow(['Filtros', input.movementType ? movementLabels[input.movementType] : 'Todos los tipos', input.productName ?? 'Todos los productos']);
  const header = sheet.addRow(['Fecha', 'Tipo', 'Producto', 'Presentación', 'Cantidad', 'Unidad', 'Motivo']);
  header.height = 25;
  header.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_NAVY } };
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: WHITE } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  for (const item of input.rows) {
    const row = sheet.addRow([
      date(item.created_at), movementLabels[item.type], item.product_name ?? 'Producto eliminado',
      item.presentation_name ?? 'Sin presentación', number(item.quantity), item.unit,
      formatMovementReason(item.reason, item.reference_id),
    ]);
    row.eachCell((cell, column) => {
      cell.font = { name: FONT, size: 10, color: { argb: column === 5 ? MUTED : TEXT } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: row.number % 2 === 0 ? ROW_ALT : WHITE } };
      cell.border = { bottom: { style: 'thin', color: { argb: BORDER } } };
    });
    row.getCell(1).numFmt = 'dd/mm/yyyy hh:mm';
    row.getCell(5).numFmt = item.unit === 'uds' ? '#,##0' : '#,##0.000';
  }
  const lastRow = Math.max(sheet.rowCount, 4);
  sheet.autoFilter = { from: 'A4', to: `G${lastRow}` };
  sheet.pageSetup.printArea = `A1:G${lastRow}`;
  sheet.pageSetup.printTitlesRow = '1:4';
}

export async function createReportWorkbook(input: ReportExportInput): Promise<ArrayBuffer> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  workbook.creator = 'Avenida Animal';
  workbook.lastModifiedBy = 'Avenida Animal';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.title = input.kind === 'profitability' ? 'Avenida Animal - Rentabilidad' : 'Avenida Animal - Movimientos';
  workbook.subject = `Período ${input.range.from} a ${input.range.to}`;
  workbook.company = 'Avenida Animal';

  if (input.kind === 'profitability') addProfitabilitySheet(workbook, input);
  else addMovementsSheet(workbook, input);

  const output = await workbook.xlsx.writeBuffer();
  if (output instanceof ArrayBuffer) return output;
  return new Uint8Array(output).buffer;
}

export async function downloadReportWorkbook(input: ReportExportInput): Promise<string> {
  const bytes = await createReportWorkbook(input);
  const rangeLabel = input.kind === 'profitability'
    ? `${filenameDate(input.range.from)}_a_${filenameDate(input.range.to)}`
    : `${input.range.from}_a_${input.range.to}`;
  const filename = `avenida-animal-${input.kind === 'profitability' ? 'rentabilidad' : 'movimientos'}_${rangeLabel}.xlsx`;
  const url = URL.createObjectURL(new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return filename;
}
