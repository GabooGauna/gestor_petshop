import { supabase } from '../lib/supabase';
import type { Json } from '../types/database.types';
import type { DecimalString } from '../types/domain';

export type DecimalInput = DecimalString;
export type SaleMode = 'amount' | 'weight' | 'package' | 'unit';

interface SaleItemBase {
  presentation_id: string;
}
export type SaleItemPayload =
  | (SaleItemBase & { mode: 'amount'; amount: DecimalInput })
  | (SaleItemBase & { mode: Exclude<SaleMode, 'amount'>; quantity: DecimalInput });

export interface SaleResult {
  sale_id: string;
  total_amount: DecimalInput;
  total_cost: DecimalInput;
  items: Array<{
    sale_item_id: string;
    product_id: string;
    presentation_id: string;
    mode: SaleMode;
    commercial_quantity: DecimalInput;
    stock_quantity: DecimalInput;
    unit_price: DecimalInput;
    subtotal: DecimalInput;
    line_cost: DecimalInput;
    stock_after: DecimalInput;
  }>;
}

function isSaleResult(value: unknown): value is SaleResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.sale_id === 'string'
    && isDecimal(candidate.total_amount)
    && isDecimal(candidate.total_cost)
    && Array.isArray(candidate.items)
    && candidate.items.every(item => {
      if (!item || typeof item !== 'object') return false;
      const row = item as Record<string, unknown>;
      return typeof row.sale_item_id === 'string'
        && typeof row.product_id === 'string'
        && typeof row.presentation_id === 'string'
        && typeof row.mode === 'string'
        && ['amount', 'weight', 'package', 'unit'].includes(row.mode)
        && isDecimal(row.commercial_quantity)
        && isDecimal(row.stock_quantity)
        && isDecimal(row.unit_price)
        && isDecimal(row.subtotal)
        && isDecimal(row.line_cost)
        && isDecimal(row.stock_after);
    });
}

function isDecimal(value: unknown): value is DecimalString {
  return typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value);
}

export const saleCalculations = {
  calculateQuantityByAmount(amount: number, pricePerKg: number): number {
    if (pricePerKg <= 0) return 0;
    return Number((amount / pricePerKg).toFixed(3));
  },
  calculateAmountByQuantity(quantity: number, pricePerUnit: number): number {
    return Number((quantity * pricePerUnit).toFixed(2));
  },
};

export const saleService = {
  async processSale(paymentMethod: string, items: SaleItemPayload[]): Promise<SaleResult> {
    const { data, error } = await supabase.rpc('process_sale', {
      p_payment_method: paymentMethod,
      p_items: items as unknown as Json,
    });
    if (error) {
      if (error.message.includes('INSUFFICIENT_STOCK')) {
        throw new Error('El stock cambió y ya no alcanza para completar la venta. Revisá las cantidades del ticket.');
      }
      throw error;
    }
    if (!isSaleResult(data)) throw new Error('PETSTOCK_INVALID_SALE_RESPONSE');
    return data;
  },
};
