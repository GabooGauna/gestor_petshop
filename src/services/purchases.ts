import { supabase } from '../lib/supabase';

type PurchaseItemPayload = {
  product_id: string;
  presentation_id: string;
  quantity: number;
  unit_cost: number;
  subtotal: number;
};

export const purchaseService = {
  async processPurchase(
    supplier_id: string,
    total_amount: number,
    invoice_number: string,
    items: PurchaseItemPayload[]
  ) {
    const { data, error } = await supabase.rpc('process_purchase', {
      p_supplier_id: supplier_id,
      p_total_amount: total_amount,
      p_invoice_number: invoice_number,
      p_items: items,
    });

    if (error) throw error;
    return data;
  },

  async getPurchases() {
    const { data, error } = await supabase
      .from('purchases')
      .select('*, purchase_items(*, products(*), product_presentations(*))')
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    return data;
  }
};
