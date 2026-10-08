import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';

type Product = Database['public']['Tables']['products']['Row'];
type ProductInsert = Database['public']['Tables']['products']['Insert'];
type Presentation = Database['public']['Tables']['product_presentations']['Row'];
type PresentationInsert = Database['public']['Tables']['product_presentations']['Insert'];
type PresentationUpdate = Database['public']['Tables']['product_presentations']['Update'];

export const productService = {
  async getCategories() {
    const { data, error } = await supabase.from('categories').select('*').order('name');
    if (error) throw error;
    return data;
  },

  async getProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('*, product_presentations(*)')
      .order('name');
    if (error) throw error;
    return data;
  },

  async createProduct(product: ProductInsert) {
    const { data, error } = await supabase.from('products').insert(product).select().single();
    if (error) throw error;
    return data;
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
    if (error) throw error;
    return data;
  },

  async updatePresentationStock(id: string, newStock: number) {
    const { data, error } = await supabase
      .from('product_presentations')
      .update({ stock: newStock })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
};
