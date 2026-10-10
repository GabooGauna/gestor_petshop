import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';

type ProductInsert = Database['public']['Tables']['products']['Insert'];
type ProductUpdate = Database['public']['Tables']['products']['Update'];
type PresentationInsert = Database['public']['Tables']['product_presentations']['Insert'];
type PresentationUpdate = Database['public']['Tables']['product_presentations']['Update'];

type Category = Database['public']['Tables']['categories']['Row'];

export const productService = {
  async getCategories(): Promise<Category[]> {
    const { data, error } = await supabase.from('categories').select('*').order('name');
    if (error) throw error;
    return data ?? [];
  },

  async createCategory(name: string): Promise<Category> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('El nombre de la categoría no puede estar vacío.');
    const { data, error } = await supabase
      .from('categories')
      .insert({ name: trimmed })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteCategory(id: string): Promise<void> {
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) throw error;
  },

  async deleteProduct(id: string): Promise<void> {
    const { error } = await supabase.rpc('delete_product', { p_product_id: id });
    if (!error) return;
    if (error.message.includes('PRODUCT_HAS_TRANSACTIONS')) throw new Error('Este producto tiene ventas o compras registradas y debe conservarse para mantener el historial.');
    if (error.message.includes('PRODUCT_NOT_FOUND')) throw new Error('El producto ya no existe.');
    throw new Error(error.message || 'No se pudo eliminar el producto.');
  },

  async deletePresentation(id: string): Promise<void> {
    const { error } = await supabase.rpc('delete_presentation', { p_presentation_id: id });
    if (!error) return;
    if (error.message.includes('PRESENTATION_HAS_TRANSACTIONS')) throw new Error('Esta presentación tiene ventas o compras registradas y debe conservarse para mantener el historial.');
    if (error.message.includes('PRESENTATION_NOT_FOUND')) throw new Error('La presentación ya no existe.');
    throw new Error(error.message || 'No se pudo eliminar la presentación.');
  },

  async getProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('*, product_presentations(*)')
      .order('name');
    if (error) throw error;
    return data;
  },

  async updateProduct(id: string, updates: ProductUpdate): Promise<void> {
    const { error } = await supabase.from('products').update(updates).eq('id', id);
    if (error) throw new Error(error.message || 'No se pudo actualizar el producto.');
  },

  async createProductWithPresentation(params: {
    product: ProductInsert;
    presentation: {
      name: string;
      weight_kg?: number | null;
      cost: number;
      price: number;
      price_per_kg?: number | null;
      initialStock?: `${number}`;
    };
  }) {
    const { data: createdProduct, error: prodErr } = await supabase
      .from('products')
      .insert(params.product)
      .select()
      .single();
    if (prodErr || !createdProduct) throw prodErr ?? new Error('Error al crear el producto.');

    const { data: createdPresentation, error: presErr } = await supabase
      .from('product_presentations')
      .insert({
        product_id: createdProduct.id,
        name: params.presentation.name.trim() || 'Principal',
        weight_kg: params.presentation.weight_kg ?? null,
        cost: params.presentation.cost || 0,
        price: params.presentation.price || 0,
        price_per_kg: params.presentation.price_per_kg ?? null,
      })
      .select()
      .single();

    if (presErr || !createdPresentation) throw presErr ?? new Error('Error al crear la presentación.');
    if (params.presentation.initialStock && Number(params.presentation.initialStock) > 0) {
      const { error: stockError } = await supabase.rpc('record_stock_adjustment', {
        p_presentation_id: createdPresentation.id,
        p_physical_stock: params.presentation.initialStock,
        p_reason: 'Saldo inicial al crear la presentación',
      });
      if (stockError) throw stockError;
    }
    return createdProduct;
  },

  async createPresentation(presentation: PresentationInsert) {
    const { data, error } = await supabase
      .from('product_presentations')
      .insert(presentation)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updatePresentation(id: string, updates: PresentationUpdate) {
    const { data, error } = await supabase
      .from('product_presentations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message || 'No se pudo actualizar la presentación.');
    return data;
  },

};
