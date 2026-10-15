import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';
import type { DecimalString } from '../types/domain';

type ProductInsert = Database['public']['Tables']['products']['Insert'];
type ProductUpdate = Database['public']['Tables']['products']['Update'];
type PresentationInsert = Database['public']['Tables']['product_presentations']['Insert'];
type PresentationUpdate = Database['public']['Tables']['product_presentations']['Update'];
export type CatalogPresentationUpdate = Pick<PresentationUpdate, 'name' | 'weight_kg' | 'price' | 'price_per_kg' | 'min_stock'>;
type Category = Database['public']['Tables']['categories']['Row'];
type MoneyRpcValue = `${number}`;

export type ProductServiceErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'PRODUCT_NAME_REQUIRED'
  | 'PETSTOCK_PRODUCT_TYPE_INVALID'
  | 'CATEGORY_NOT_FOUND'
  | 'PRESENTATION_NAME_REQUIRED'
  | 'INVALID_MIN_STOCK'
  | 'INVALID_INITIAL_STOCK'
  | 'INVALID_UNIT_STOCK'
  | 'INVALID_UNIT_MIN_STOCK'
  | 'INVALID_PRICE'
  | 'PETSTOCK_WEIGHT_REQUIRED'
  | 'PETSTOCK_UNIT_PRESENTATION_HAS_WEIGHT_FIELDS'
  | 'PRODUCT_NOT_FOUND'
  | 'PRESENTATION_NOT_FOUND'
  | 'INACTIVE_PRODUCT'
  | 'INACTIVE_PRESENTATION'
  | 'PRESENTATION_ALREADY_INACTIVE'
  | 'PRESENTATION_ALREADY_ACTIVE'
  | 'NUMERIC_OVERFLOW'
  | 'PETSTOCK_INVALID_PRODUCT_RESPONSE'
  | 'PETSTOCK_INVALID_PRESENTATION_RESPONSE'
  | 'PETSTOCK_INVALID_PRESENTATION_LIFECYCLE_RESPONSE'
  | 'PRODUCT_CREATION_FAILED'
  | 'PRESENTATION_CREATION_FAILED'
  | 'PRESENTATION_UPDATE_FAILED'
  | 'PRESENTATION_ARCHIVE_FAILED'
  | 'PRESENTATION_REACTIVATION_FAILED';

export class ProductServiceError extends Error {
  readonly code: ProductServiceErrorCode;

  constructor(
    code: ProductServiceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProductServiceError';
    this.code = code;
  }
}

const productErrorMessages: Record<ProductServiceErrorCode, string> = {
  AUTHENTICATION_REQUIRED: 'Tu sesión venció. Volvé a iniciar sesión para crear el producto.',
  PRODUCT_NAME_REQUIRED: 'Ingresá el nombre del producto.',
  PETSTOCK_PRODUCT_TYPE_INVALID: 'Seleccioná un tipo de venta válido.',
  CATEGORY_NOT_FOUND: 'La categoría seleccionada ya no existe. Volvé a seleccionarla.',
  PRESENTATION_NAME_REQUIRED: 'Ingresá el nombre de la presentación.',
  INVALID_MIN_STOCK: 'El stock mínimo debe ser cero o un valor positivo con hasta tres decimales.',
  INVALID_INITIAL_STOCK: 'El stock inicial debe ser cero o un valor positivo con hasta tres decimales.',
  INVALID_UNIT_STOCK: 'El stock de productos por unidad debe ser un número entero.',
  INVALID_UNIT_MIN_STOCK: 'El stock mínimo de productos por unidad debe ser un número entero.',
  INVALID_PRICE: 'Precio y costo deben ser valores positivos con hasta dos decimales.',
  PETSTOCK_WEIGHT_REQUIRED: 'Indicá un peso de bulto mayor que cero.',
  PETSTOCK_UNIT_PRESENTATION_HAS_WEIGHT_FIELDS: 'Los productos por unidad no pueden incluir peso ni precio por kilo.',
  PRODUCT_NOT_FOUND: 'El producto ya no existe o está inactivo.',
  PRESENTATION_NOT_FOUND: 'La presentación ya no existe.',
  INACTIVE_PRODUCT: 'El producto está inactivo. Reactivalo antes de administrar sus presentaciones.',
  INACTIVE_PRESENTATION: 'La presentación está archivada y no admite cambios ni operaciones.',
  PRESENTATION_ALREADY_INACTIVE: 'La presentación ya está archivada.',
  PRESENTATION_ALREADY_ACTIVE: 'La presentación ya está activa.',
  NUMERIC_OVERFLOW: 'Uno de los valores ingresados supera el máximo permitido.',
  PETSTOCK_INVALID_PRODUCT_RESPONSE: 'El producto se creó, pero el servidor devolvió una respuesta inválida. Recargá el catálogo antes de reintentar.',
  PETSTOCK_INVALID_PRESENTATION_RESPONSE: 'La presentación se creó, pero el servidor devolvió una respuesta inválida. Recargá el producto antes de reintentar.',
  PETSTOCK_INVALID_PRESENTATION_LIFECYCLE_RESPONSE: 'El estado cambió, pero el servidor devolvió una respuesta inválida. Recargá el catálogo antes de reintentar.',
  PRODUCT_CREATION_FAILED: 'No se pudo crear el producto. Revisá los datos e intentá nuevamente.',
  PRESENTATION_CREATION_FAILED: 'No se pudo crear la presentación. Revisá los datos e intentá nuevamente.',
  PRESENTATION_UPDATE_FAILED: 'No se pudo actualizar la presentación. Revisá los datos e intentá nuevamente.',
  PRESENTATION_ARCHIVE_FAILED: 'No se pudo archivar la presentación. Intentá nuevamente.',
  PRESENTATION_REACTIVATION_FAILED: 'No se pudo reactivar la presentación. Intentá nuevamente.',
};

function productServiceError(code: ProductServiceErrorCode, cause?: unknown): ProductServiceError {
  return new ProductServiceError(code, productErrorMessages[code], { cause });
}

function normalizeMoneyForRpc(value: number): MoneyRpcValue {
  if (!Number.isFinite(value) || value < 0) throw productServiceError('INVALID_PRICE');
  return value.toFixed(2) as MoneyRpcValue;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== 'object') return '';
  const record = error as Record<string, unknown>;
  return [record.code, record.message, record.details, record.hint]
    .filter((part): part is string => typeof part === 'string')
    .join(' ');
}

function serviceError(error: unknown, fallback: ProductServiceErrorCode): ProductServiceError {
  const text = errorText(error);
  const knownCodes = Object.keys(productErrorMessages) as ProductServiceErrorCode[];
  const matchedCode = knownCodes.find(code => text.includes(code));
  return productServiceError(matchedCode ?? fallback, error);
}

interface CreatedProduct {
  id: string;
  name: string;
  brand: string | null;
  category_id: string | null;
  type: string;
  min_stock: DecimalString;
  status: string;
  created_at: string | null;
  presentation_id: string;
}

export interface CreatedPresentation {
  id: string;
  product_id: string;
  name: string;
  weight_kg: DecimalString | null;
  cost: DecimalString;
  price: DecimalString;
  price_per_kg: DecimalString | null;
  stock: DecimalString;
  min_stock: DecimalString;
  status: PresentationStatus;
  created_at: string | null;
}

export type PresentationStatus = 'active' | 'inactive';

export interface PresentationLifecycleResult {
  presentation_id: string;
  product_id: string;
  name: string;
  status: PresentationStatus;
  archived: boolean;
  reactivated: boolean;
}

function isCreatedProduct(value: unknown): value is CreatedProduct {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string'
    && typeof row.name === 'string'
    && (row.brand === null || typeof row.brand === 'string')
    && (row.category_id === null || typeof row.category_id === 'string')
    && (row.type === 'unit' || row.type === 'weight')
    && typeof row.min_stock === 'string'
    && row.status === 'active'
    && (row.created_at === null || typeof row.created_at === 'string')
    && typeof row.presentation_id === 'string';
}

function normalizeDecimalResponse(value: unknown): DecimalString | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const normalized = String(value);
  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? normalized as DecimalString : null;
}

function parseCreatedPresentation(value: unknown): CreatedPresentation | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const cost = normalizeDecimalResponse(row.cost);
  const price = normalizeDecimalResponse(row.price);
  const stock = normalizeDecimalResponse(row.stock);
  const minStock = normalizeDecimalResponse(row.min_stock);
  const weight = row.weight_kg === null ? null : normalizeDecimalResponse(row.weight_kg);
  const pricePerKg = row.price_per_kg === null ? null : normalizeDecimalResponse(row.price_per_kg);
  if (typeof row.id !== 'string' || typeof row.product_id !== 'string' || typeof row.name !== 'string'
    || cost === null || price === null || stock === null || minStock === null
    || (row.weight_kg !== null && weight === null)
    || (row.price_per_kg !== null && pricePerKg === null)
    || (row.created_at !== null && typeof row.created_at !== 'string')
    || (row.status !== undefined && row.status !== 'active')) return null;
  return {
    id: row.id,
    product_id: row.product_id,
    name: row.name,
    weight_kg: weight,
    cost,
    price,
    price_per_kg: pricePerKg,
    stock,
    min_stock: minStock,
    status: 'active',
    created_at: row.created_at,
  };
}

function parsePresentationLifecycleResult(value: unknown): PresentationLifecycleResult | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.presentation_id !== 'string'
    || typeof row.product_id !== 'string'
    || typeof row.name !== 'string'
    || (row.status !== 'active' && row.status !== 'inactive')
    || typeof row.archived !== 'boolean'
    || typeof row.reactivated !== 'boolean') return null;
  return {
    presentation_id: row.presentation_id,
    product_id: row.product_id,
    name: row.name,
    status: row.status,
    archived: row.archived,
    reactivated: row.reactivated,
  };
}

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
    throw new Error(error.message || 'No se pudo dar de baja el producto.');
  },

  async archivePresentation(id: string): Promise<PresentationLifecycleResult> {
    const { data, error } = await supabase.rpc('archive_presentation', { p_presentation_id: id });
    if (error) throw serviceError(error, 'PRESENTATION_ARCHIVE_FAILED');
    const result = parsePresentationLifecycleResult(data);
    if (!result || result.status !== 'inactive' || !result.archived || result.reactivated) {
      throw productServiceError('PETSTOCK_INVALID_PRESENTATION_LIFECYCLE_RESPONSE');
    }
    return result;
  },

  async reactivatePresentation(id: string): Promise<PresentationLifecycleResult> {
    const { data, error } = await supabase.rpc('reactivate_presentation', { p_presentation_id: id });
    if (error) throw serviceError(error, 'PRESENTATION_REACTIVATION_FAILED');
    const result = parsePresentationLifecycleResult(data);
    if (!result || result.status !== 'active' || result.archived || !result.reactivated) {
      throw productServiceError('PETSTOCK_INVALID_PRESENTATION_LIFECYCLE_RESPONSE');
    }
    return result;
  },

  /** @deprecated Use archivePresentation; physical presentation deletion is unsupported. */
  async deletePresentation(id: string): Promise<void> {
    await this.archivePresentation(id);
  },

  async getProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('*, product_presentations(*)')
      .eq('status', 'active')
      .order('name');
    if (error) throw error;
    return data;
  },

  async getOperationalProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('*, product_presentations!inner(*)')
      .eq('status', 'active')
      .eq('product_presentations.status', 'active')
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
      min_stock: number;
    };
  }): Promise<CreatedProduct> {
    const cost = normalizeMoneyForRpc(params.presentation.cost);
    const price = normalizeMoneyForRpc(params.presentation.price);
    const pricePerKg = params.presentation.price_per_kg === null || params.presentation.price_per_kg === undefined
      ? null
      : normalizeMoneyForRpc(params.presentation.price_per_kg);
    const { data, error } = await supabase.rpc('create_product_with_presentation', {
      p_name: params.product.name,
      p_brand: params.product.brand ?? null,
      p_category_id: params.product.category_id ?? null,
      p_type: params.product.type ?? 'unit',
      p_min_stock: params.presentation.min_stock,
      p_presentation_name: params.presentation.name.trim() || 'Principal',
      p_weight_kg: params.presentation.weight_kg ?? null,
      p_cost: cost,
      p_price: price,
      p_price_per_kg: pricePerKg,
      p_initial_stock: params.presentation.initialStock ?? '0',
    });
    if (error) throw serviceError(error, 'PRODUCT_CREATION_FAILED');
    if (!isCreatedProduct(data)) throw productServiceError('PETSTOCK_INVALID_PRODUCT_RESPONSE');
    return data;
  },

  async createPresentation(presentation: Pick<PresentationInsert, 'product_id' | 'name' | 'weight_kg' | 'cost' | 'price' | 'price_per_kg' | 'stock' | 'min_stock'>): Promise<CreatedPresentation> {
    if (!presentation.product_id) throw new Error('Seleccioná un producto para la presentación.');
    const cost = normalizeMoneyForRpc(presentation.cost ?? 0);
    const price = normalizeMoneyForRpc(presentation.price ?? 0);
    const pricePerKg = presentation.price_per_kg === null || presentation.price_per_kg === undefined
      ? null
      : normalizeMoneyForRpc(presentation.price_per_kg);
    const { data, error } = await supabase.rpc('create_product_presentation', {
      p_product_id: presentation.product_id,
      p_name: presentation.name.trim(),
      p_weight_kg: presentation.weight_kg ?? null,
      p_cost: cost,
      p_price: price,
      p_price_per_kg: pricePerKg,
      p_initial_stock: presentation.stock ?? 0,
      p_min_stock: presentation.min_stock ?? 0,
    });
    if (error) throw serviceError(error, 'PRESENTATION_CREATION_FAILED');
    const created = parseCreatedPresentation(data);
    if (!created) throw productServiceError('PETSTOCK_INVALID_PRESENTATION_RESPONSE');
    return created;
  },

  async updatePresentation(id: string, updates: CatalogPresentationUpdate) {
    const catalogUpdates: CatalogPresentationUpdate = {
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.weight_kg !== undefined && { weight_kg: updates.weight_kg }),
      ...(updates.price !== undefined && { price: updates.price }),
      ...(updates.price_per_kg !== undefined && { price_per_kg: updates.price_per_kg }),
      ...(updates.min_stock !== undefined && { min_stock: updates.min_stock }),
    };
    const { data, error } = await supabase
      .from('product_presentations')
      .update(catalogUpdates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw serviceError(error, 'PRESENTATION_UPDATE_FAILED');
    return data;
  },

};
