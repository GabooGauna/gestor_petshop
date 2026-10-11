import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';

type Supplier = Database['public']['Tables']['suppliers']['Row'];
type SupplierInsert = Database['public']['Tables']['suppliers']['Insert'];

function supplierRemovalError(message: string): Error {
  if (message.includes('SUPPLIER_NOT_FOUND')) {
    return new Error('El proveedor ya no existe o fue eliminado anteriormente.');
  }
  if (message.includes('AUTHENTICATION_REQUIRED')) {
    return new Error('Tu sesión venció. Volvé a ingresar para eliminar el proveedor.');
  }
  return new Error(message || 'No se pudo eliminar el proveedor.');
}

export const supplierService = {
  async getSuppliers(): Promise<Supplier[]> {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('name');
    if (error) throw error;

    // Compatible durante despliegues escalonados: el esquema anterior no incluía
    // `active`, mientras que el nuevo conserva proveedores archivados para historial.
    return (data ?? [])
      .filter(supplier => supplier.active !== false)
      .map(supplier => ({ ...supplier, active: supplier.active ?? true }));
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

  async removeSupplier(id: string): Promise<void> {
    const { error } = await supabase.rpc('remove_supplier', { p_supplier_id: id });
    if (error) throw supplierRemovalError(error.message);
  },
};
