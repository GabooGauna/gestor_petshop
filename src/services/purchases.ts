import { supabase } from '../lib/supabase';
import type { Json } from '../types/database.types';
import type { DecimalInput } from './saleService';

export interface PurchaseItemPayload {
  presentation_id: string;
  quantity: DecimalInput;
  unit_cost: DecimalInput;
}

export interface PurchaseResult {
  purchase_id: string;
  total_amount: DecimalInput;
  items: Array<{
    purchase_item_id: string;
    product_id: string;
    presentation_id: string;
    quantity: DecimalInput;
    unit_cost: DecimalInput;
    subtotal: DecimalInput;
    stock_added: DecimalInput;
    stock_after: DecimalInput;
  }>;
}

function isPurchaseResult(value: unknown): value is PurchaseResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.purchase_id === 'string'
    && typeof candidate.total_amount === 'string'
    && Array.isArray(candidate.items);
}

export const purchaseService = {
  async processPurchase(
    supplierId: string,
    invoiceNumber: string,
    items: PurchaseItemPayload[],
  ): Promise<PurchaseResult> {
    const { data, error } = await supabase.rpc('process_purchase', {
      p_supplier_id: supplierId,
      p_invoice_number: invoiceNumber,
      p_items: items as unknown as Json,
    });
    if (error) throw error;
    if (!isPurchaseResult(data)) throw new Error('PETSTOCK_INVALID_PURCHASE_RESPONSE');
    return data;
  },
};
