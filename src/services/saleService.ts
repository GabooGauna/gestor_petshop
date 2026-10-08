import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';

type SaleItemPayload = {
  product_id: string;
  presentation_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  cost: number;
};

export const saleCalculations = {
  /**
   * Importe: Monto_Cobrado / Precio_Kg = Kg_a_Descontar
   * Returns weight with 3 decimal precision (NUMERIC 10,3)
   */
  calculateQuantityByAmount: (amount: number, pricePerKg: number): number => {
    if (pricePerKg <= 0) return 0;
    return Number((amount / pricePerKg).toFixed(3));
  },

  /**
   * Cantidad: Cantidad_Kg * Precio_Kg = Subtotal
   * Returns amount with 2 decimal precision (NUMERIC 12,2)
   */
  calculateAmountByQuantity: (quantity: number, pricePerUnit: number): number => {
    return Number((quantity * pricePerUnit).toFixed(2));
  },

  /**
   * Ganancia: Subtotal - (Cantidad_Vendida * Costo_Unitario)
   * Returns profit with 2 decimal precision
   */
  calculateGrossProfit: (subtotal: number, quantity: number, costPerUnit: number): number => {
    return Number((subtotal - (quantity * costPerUnit)).toFixed(2));
  }
};

export const saleService = {
  async processSale(
    total_amount: number,
    total_cost: number,
    payment_method: string,
    items: SaleItemPayload[]
  ) {
    const { data, error } = await supabase.rpc('process_sale', {
      p_total_amount: total_amount,
      p_total_cost: total_cost,
      p_payment_method: payment_method,
      p_items: items,
    });

    if (error) throw error;
    return data;
  },

  async getSales() {
    const { data, error } = await supabase
      .from('sales')
      .select('*, sale_items(*, products(*), product_presentations(*))')
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    return data;
  }
};
