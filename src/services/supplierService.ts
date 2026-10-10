import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';

type Supplier = Database['public']['Tables']['suppliers']['Row'];
type SupplierInsert = Database['public']['Tables']['suppliers']['Insert'];

export const supplierService = {
  async getSuppliers(): Promise<Supplier[]> {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('name');
    if (error) throw error;
    return data ?? [];
  },

  async createSupplier(params: { name: string; contact_info?: string }): Promise<Supplier> {
    const trimmedName = params.name.trim();
    if (!trimmedName) throw new Error('El nombre del proveedor es obligatorio.');

    const { data, error } = await supabase
      .from('suppliers')
      .insert({
        name: trimmedName,
        contact_info: params.contact_info?.trim() || null,
      } satisfies SupplierInsert)
      .select()
      .single();

    if (error || !data) throw error ?? new Error('Error al crear proveedor.');
    return data;
  },
};
