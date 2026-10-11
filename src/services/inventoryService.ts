import { supabase } from '../lib/supabase';
import type { DecimalString } from '../types/domain';
import type { Database } from '../types/database.types';

type DecimalInput = DecimalString;
type InventoryMovementRow = Database['public']['Tables']['inventory_movements']['Row'];

export type InventoryMovement = InventoryMovementRow & {
  products: { name: string } | null;
  product_presentations: { name: string; stock: number; weight_kg: number | null } | null;
};

export interface StockMutationResult {
  movement_id: string;
  product_id: string;
  presentation_id: string;
  quantity: DecimalInput;
  stock_before: DecimalInput;
  stock_after: DecimalInput;
}

function isStockMutationResult(value: unknown): value is StockMutationResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.movement_id === 'string'
    && typeof candidate.product_id === 'string'
    && typeof candidate.presentation_id === 'string'
    && typeof candidate.quantity === 'string'
    && typeof candidate.stock_before === 'string'
    && typeof candidate.stock_after === 'string';
}

export const inventoryService = {
  async getMovements(limit = 50, offset = 0): Promise<{ items: InventoryMovement[]; totalCount: number }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('INVALID_LIMIT');
    if (!Number.isInteger(offset) || offset < 0) throw new Error('INVALID_OFFSET');
    const { data, error, count } = await supabase
      .from('inventory_movements')
      .select('*, products(name), product_presentations(name, stock, weight_kg)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return { items: data ?? [], totalCount: count ?? data?.length ?? 0 };
  },

  async recordShrinkage(params: {
    presentationId: string;
    quantity: DecimalInput;
    reason: string;
  }): Promise<StockMutationResult> {
    const { data, error } = await supabase.rpc('record_shrinkage', {
      p_presentation_id: params.presentationId,
      p_quantity: params.quantity,
      p_reason: params.reason,
    });
    if (error) throw error;
    if (!isStockMutationResult(data)) throw new Error('PETSTOCK_INVALID_SHRINKAGE_RESPONSE');
    return data;
  },

  async recordAdjustment(params: {
    presentationId: string;
    physicalStock: DecimalInput;
    reason: string;
  }): Promise<StockMutationResult> {
    const { data, error } = await supabase.rpc('record_stock_adjustment', {
      p_presentation_id: params.presentationId,
      p_physical_stock: params.physicalStock,
      p_reason: params.reason,
    });
    if (error) throw error;
    if (!isStockMutationResult(data)) throw new Error('PETSTOCK_INVALID_ADJUSTMENT_RESPONSE');
    return data;
  },
};
