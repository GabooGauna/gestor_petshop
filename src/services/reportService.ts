import { supabase } from '../lib/supabase';
import type { DecimalString } from '../types/domain';

export type ReportDecimal = DecimalString;
export type PaymentMethod = 'efectivo' | 'transferencia' | 'debito' | 'credito' | 'mercado_pago' | 'otro';
export type ProductType = 'unit' | 'weight';
export type StockUnit = 'kg' | 'uds';
export type MovementType = 'compra' | 'venta' | 'ajuste' | 'merma';

export interface ReportDateRange {
  from: string;
  to: string;
}

export interface MetricSummary {
  sales_count: number;
  total_amount: ReportDecimal;
  total_cost: ReportDecimal;
  gross_profit: ReportDecimal;
  margin_pct: ReportDecimal | null;
}

export interface DashboardAnalytics {
  timezone: 'America/Argentina/Buenos_Aires';
  period: ReportDateRange;
  today: MetricSummary & { sales_change_pct: ReportDecimal | null };
  selected_period: MetricSummary & {
    sales_change_pct: ReportDecimal | null;
    profit_change_pct: ReportDecimal | null;
  };
  daily_sales: Array<{
    date: string;
    sales_count: number;
    sales: ReportDecimal;
    total_cost: ReportDecimal;
    gross_profit: ReportDecimal;
    margin_pct: ReportDecimal | null;
  }>;
  low_stock: Array<{
    product_id: string;
    product_name: string;
    presentation_id: string;
    presentation_name: string;
    product_type: ProductType;
    current_stock: ReportDecimal;
    min_stock: ReportDecimal;
    unit: StockUnit;
  }>;
  recent_sales: Array<{
    id: string;
    created_at: string;
    total_amount: ReportDecimal;
    total_cost: ReportDecimal;
    gross_profit: ReportDecimal;
    payment_method: PaymentMethod;
  }>;
  recent_purchases: Array<{
    id: string;
    created_at: string;
    total_amount: ReportDecimal;
    supplier_id: string | null;
    supplier_name: string | null;
  }>;
}

export interface ProductProfitability {
  product_id: string;
  product_name: string;
  product_type: ProductType;
  unit: StockUnit;
  sales_count: number;
  stock_quantity: ReportDecimal;
  total_amount: ReportDecimal;
  total_cost: ReportDecimal;
  gross_profit: ReportDecimal;
  margin_pct: ReportDecimal | null;
}

export interface ProductProfitabilityDetail {
  sale_id: string;
  sale_item_id: string;
  sale_date: string;
  product_id: string;
  product_name: string;
  presentation_name: string;
  product_type: ProductType;
  unit: StockUnit;
  payment_method: PaymentMethod;
  stock_quantity: ReportDecimal;
  total_amount: ReportDecimal;
  total_cost: ReportDecimal;
  gross_profit: ReportDecimal;
  margin_pct: ReportDecimal | null;
}

export interface PaymentMethodSummary {
  payment_method: PaymentMethod;
  sales_count: number;
  total_amount: ReportDecimal;
  share_pct: ReportDecimal;
}

export interface InventoryMovementReportItem {
  id: string;
  created_at: string;
  type: MovementType;
  product_id: string | null;
  product_name: string | null;
  presentation_id: string | null;
  presentation_name: string | null;
  quantity: ReportDecimal;
  unit: StockUnit;
  reason: string | null;
  reference_type: string | null;
  reference_id: string | null;
}

export interface InventoryMovementReport {
  total_count: number;
  items: InventoryMovementReportItem[];
}

export interface InventoryMovementFilters extends ReportDateRange {
  type?: MovementType;
  productId?: string;
  limit?: number;
  offset?: number;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;
const PAYMENT_METHODS: readonly PaymentMethod[] = ['efectivo', 'transferencia', 'debito', 'credito', 'mercado_pago', 'otro'];
const PRODUCT_TYPES: readonly ProductType[] = ['unit', 'weight'];
const STOCK_UNITS: readonly StockUnit[] = ['kg', 'uds'];
const MOVEMENT_TYPES: readonly MovementType[] = ['compra', 'venta', 'ajuste', 'merma'];
const DASHBOARD_RETRY_DELAYS_MS = [200, 600] as const;
const dashboardRequests = new Map<string, Promise<DashboardAnalytics>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isDecimal(value: unknown): value is ReportDecimal {
  return typeof value === 'string' && DECIMAL_PATTERN.test(value);
}

function isNullableDecimal(value: unknown): value is ReportDecimal | null {
  return value === null || isDecimal(value);
}

function isMember<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && DATE_PATTERN.test(value);
}

function isMetricSummary(value: unknown): value is MetricSummary {
  if (!isRecord(value)) return false;
  return isInteger(value.sales_count)
    && isDecimal(value.total_amount)
    && isDecimal(value.total_cost)
    && isDecimal(value.gross_profit)
    && isNullableDecimal(value.margin_pct);
}

function isDashboardAnalytics(value: unknown): value is DashboardAnalytics {
  if (!isRecord(value) || value.timezone !== 'America/Argentina/Buenos_Aires') return false;
  if (!isRecord(value.period) || !isDateString(value.period.from) || !isDateString(value.period.to)) return false;
  if (!isRecord(value.today) || !isMetricSummary(value.today) || !isNullableDecimal(value.today.sales_change_pct)) return false;
  if (!isRecord(value.selected_period) || !isMetricSummary(value.selected_period)
    || !isNullableDecimal(value.selected_period.sales_change_pct)
    || !isNullableDecimal(value.selected_period.profit_change_pct)) return false;
  if (!Array.isArray(value.daily_sales) || !value.daily_sales.every(item => isRecord(item)
    && isDateString(item.date) && isInteger(item.sales_count)
    && isDecimal(item.sales) && isDecimal(item.total_cost)
    && isDecimal(item.gross_profit) && isNullableDecimal(item.margin_pct))) return false;
  if (!Array.isArray(value.low_stock) || !value.low_stock.every(item => isRecord(item)
    && typeof item.product_id === 'string' && typeof item.product_name === 'string'
    && typeof item.presentation_id === 'string' && typeof item.presentation_name === 'string'
    && isMember(PRODUCT_TYPES, item.product_type) && isDecimal(item.current_stock)
    && isDecimal(item.min_stock) && isMember(STOCK_UNITS, item.unit))) return false;
  if (!Array.isArray(value.recent_sales) || !value.recent_sales.every(item => isRecord(item)
    && typeof item.id === 'string' && typeof item.created_at === 'string'
    && isDecimal(item.total_amount) && isDecimal(item.total_cost) && isDecimal(item.gross_profit)
    && isMember(PAYMENT_METHODS, item.payment_method))) return false;
  return Array.isArray(value.recent_purchases) && value.recent_purchases.every(item => isRecord(item)
    && typeof item.id === 'string' && typeof item.created_at === 'string'
    && isDecimal(item.total_amount) && isNullableString(item.supplier_id)
    && isNullableString(item.supplier_name));
}

function isProductProfitability(value: unknown): value is ProductProfitability {
  if (!isRecord(value)) return false;
  return typeof value.product_id === 'string'
    && typeof value.product_name === 'string'
    && isMember(PRODUCT_TYPES, value.product_type)
    && isMember(STOCK_UNITS, value.unit)
    && isInteger(value.sales_count)
    && isDecimal(value.stock_quantity)
    && isDecimal(value.total_amount)
    && isDecimal(value.total_cost)
    && isDecimal(value.gross_profit)
    && isNullableDecimal(value.margin_pct);
}

function isProductProfitabilityList(value: unknown): value is ProductProfitability[] {
  return Array.isArray(value) && value.every(isProductProfitability);
}

function isProductProfitabilityDetail(value: unknown): value is ProductProfitabilityDetail {
  if (!isRecord(value)) return false;
  return typeof value.sale_id === 'string'
    && typeof value.sale_item_id === 'string'
    && typeof value.sale_date === 'string'
    && typeof value.product_id === 'string'
    && typeof value.product_name === 'string'
    && typeof value.presentation_name === 'string'
    && isMember(PRODUCT_TYPES, value.product_type)
    && isMember(STOCK_UNITS, value.unit)
    && isMember(PAYMENT_METHODS, value.payment_method)
    && isDecimal(value.stock_quantity)
    && isDecimal(value.total_amount)
    && isDecimal(value.total_cost)
    && isDecimal(value.gross_profit)
    && isNullableDecimal(value.margin_pct);
}

function isProductProfitabilityDetailList(value: unknown): value is ProductProfitabilityDetail[] {
  return Array.isArray(value) && value.every(isProductProfitabilityDetail);
}

function isPaymentMethodSummary(value: unknown): value is PaymentMethodSummary {
  if (!isRecord(value)) return false;
  return isMember(PAYMENT_METHODS, value.payment_method)
    && isInteger(value.sales_count)
    && isDecimal(value.total_amount)
    && isDecimal(value.share_pct);
}

function isPaymentMethodSummaryList(value: unknown): value is PaymentMethodSummary[] {
  return Array.isArray(value) && value.every(isPaymentMethodSummary);
}

function isMovementItem(value: unknown): value is InventoryMovementReportItem {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.created_at === 'string'
    && isMember(MOVEMENT_TYPES, value.type)
    && isNullableString(value.product_id)
    && isNullableString(value.product_name)
    && isNullableString(value.presentation_id)
    && isNullableString(value.presentation_name)
    && isDecimal(value.quantity)
    && isMember(STOCK_UNITS, value.unit)
    && isNullableString(value.reason)
    && isNullableString(value.reference_type)
    && isNullableString(value.reference_id);
}

function isInventoryMovementReport(value: unknown): value is InventoryMovementReport {
  return isRecord(value)
    && isInteger(value.total_count)
    && Array.isArray(value.items)
    && value.items.every(isMovementItem);
}

function parseDate(value: string): number {
  if (!DATE_PATTERN.test(value)) throw new Error('INVALID_DATE_RANGE');
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new Error('INVALID_DATE_RANGE');
  }
  return timestamp;
}

function validateRange(range: ReportDateRange): void {
  const from = parseDate(range.from);
  const to = parseDate(range.to);
  const inclusiveDays = Math.floor((to - from) / 86_400_000) + 1;
  if (inclusiveDays < 1) throw new Error('INVALID_DATE_RANGE');
  if (inclusiveDays > 366) throw new Error('DATE_RANGE_TOO_LARGE');
}

function validatePagination(limit: number, offset: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('INVALID_LIMIT');
  if (!Number.isInteger(offset) || offset < 0) throw new Error('INVALID_OFFSET');
}

function reportErrorCode(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (!isRecord(error)) return '';
  return [error.code, error.message]
    .filter((part): part is string => typeof part === 'string')
    .join(' ');
}

function shouldRetryDashboard(error: unknown): boolean {
  const code = reportErrorCode(error);
  if (!code) return true;
  if (code.includes('PETSTOCK_INVALID_DASHBOARD_RESPONSE')
    || code.includes('INVALID_DATE_RANGE')
    || code.includes('DATE_RANGE_TOO_LARGE')) return false;
  if (/\b(?:P0001|42501)\b/.test(code)
    || /\b(?:22|23|42)[A-Z0-9]{3}\b/.test(code)
    || /\bPGRST3\d{2}\b/.test(code)) return false;
  return true;
}

function wait(delayMs: number): Promise<void> {
  return new Promise(resolve => globalThis.setTimeout(resolve, delayMs));
}

async function requestDashboard(range: ReportDateRange): Promise<DashboardAnalytics> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const { data, error } = await supabase.rpc('get_dashboard_analytics', {
        p_from: range.from,
        p_to: range.to,
      });
      if (error) throw error;
      if (!isDashboardAnalytics(data)) throw new Error('PETSTOCK_INVALID_DASHBOARD_RESPONSE');
      return data;
    } catch (error: unknown) {
      const delay = DASHBOARD_RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !shouldRetryDashboard(error)) throw error;
      await wait(delay);
    }
  }
}

export const reportService = {
  async getDashboard(range: ReportDateRange): Promise<DashboardAnalytics> {
    validateRange(range);
    const key = `${range.from}:${range.to}`;
    const activeRequest = dashboardRequests.get(key);
    if (activeRequest) return activeRequest;

    const request = requestDashboard(range).finally(() => {
      if (dashboardRequests.get(key) === request) dashboardRequests.delete(key);
    });
    dashboardRequests.set(key, request);
    return request;
  },

  async getProductProfitability(range: ReportDateRange): Promise<ProductProfitability[]> {
    validateRange(range);
    const { data, error } = await supabase.rpc('get_product_profitability_report', {
      p_from: range.from,
      p_to: range.to,
    });
    if (error) throw error;
    if (!isProductProfitabilityList(data)) {
      throw new Error('PETSTOCK_INVALID_PROFITABILITY_RESPONSE');
    }
    return data;
  },

  async getProfitabilityDetail(range: ReportDateRange): Promise<ProductProfitabilityDetail[]> {
    validateRange(range);
    const { data, error } = await supabase.rpc('get_profitability_detail_report', {
      p_from: range.from,
      p_to: range.to,
    });
    if (error) throw error;
    if (!isProductProfitabilityDetailList(data)) {
      throw new Error('PETSTOCK_INVALID_PROFITABILITY_DETAIL_RESPONSE');
    }
    return data;
  },

  async getPaymentMethods(range: ReportDateRange): Promise<PaymentMethodSummary[]> {
    validateRange(range);
    const { data, error } = await supabase.rpc('get_payment_method_report', {
      p_from: range.from,
      p_to: range.to,
    });
    if (error) throw error;
    if (!isPaymentMethodSummaryList(data) || data.length !== PAYMENT_METHODS.length) {
      throw new Error('PETSTOCK_INVALID_PAYMENT_REPORT_RESPONSE');
    }
    return data;
  },

  async getInventoryMovements(filters: InventoryMovementFilters): Promise<InventoryMovementReport> {
    validateRange(filters);
    const limit = filters.limit ?? 100;
    const offset = filters.offset ?? 0;
    validatePagination(limit, offset);
    const { data, error } = await supabase.rpc('get_inventory_movement_report', {
      p_from: filters.from,
      p_to: filters.to,
      p_type: filters.type,
      p_product_id: filters.productId,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) throw error;
    if (!isInventoryMovementReport(data)) throw new Error('PETSTOCK_INVALID_MOVEMENT_REPORT_RESPONSE');
    return data;
  },

  async getAllInventoryMovements(
    filters: Omit<InventoryMovementFilters, 'limit' | 'offset'>,
  ): Promise<InventoryMovementReportItem[]> {
    const pageSize = 500;
    const items: InventoryMovementReportItem[] = [];
    for (;;) {
      const page = await this.getInventoryMovements({
        ...filters, limit: pageSize, offset: items.length,
      });
      items.push(...page.items);
      if (items.length >= page.total_count) break;
      if (page.items.length === 0) {
        throw new Error('PETSTOCK_INCOMPLETE_MOVEMENT_EXPORT');
      }
    }
    return items;
  },
};
