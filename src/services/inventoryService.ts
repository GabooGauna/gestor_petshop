import { supabase } from '../lib/supabase';
import type { Database } from '../types/database.types';

type MovementRow = Database['public']['Tables']['inventory_movements']['Row'];
type MovementInsert = Database['public']['Tables']['inventory_movements']['Insert'];

// Valores aceptados por la CHECK constraint de la BD:
// CHECK (type = ANY (ARRAY['compra','venta','ajuste','merma']))
export type MovementType = 'compra' | 'venta' | 'ajuste' | 'merma';

export const inventoryService = {
  /** Historial global de movimientos con nombre de producto y presentación. */
  async getMovements() {
    const { data, error } = await supabase
      .from('inventory_movements')
      .select('*, products(name), product_presentations(name, stock, weight_kg)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  /** Historial de una presentación específica (Kardex). */
  async getKardex(presentationId: string): Promise<MovementRow[]> {
    const { data, error } = await supabase
      .from('inventory_movements')
      .select('*')
      .eq('presentation_id', presentationId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  /**
   * Registra una merma y descuenta el stock.
   * quantity: valor positivo — se almacena internamente como NEGATIVO.
   * reason: OBLIGATORIO (regla de negocio).
   */
  async recordShrinkage(params: {
    presentationId: string;
    productId: string;
    quantity: number;
    reason: string;
    currentStock: number;
  }): Promise<MovementRow> {
    const { presentationId, productId, quantity, reason, currentStock } = params;

    if (!reason || reason.trim() === '') {
      throw new Error('El motivo es obligatorio para registrar una merma.');
    }
    if (quantity <= 0) {
      throw new Error('La cantidad de merma debe ser mayor a cero.');
    }
    if (quantity > currentStock) {
      throw new Error(`Stock insuficiente. Stock actual: ${currentStock}.`);
    }

    // 1. Insertar movimiento con cantidad NEGATIVA y type='merma' (según constraint BD)
    const { data: movement, error: movErr } = await supabase
      .from('inventory_movements')
      .insert({
        presentation_id: presentationId,
        product_id: productId,
        quantity: -Math.abs(quantity),
        type: 'merma' satisfies MovementType,
        reason: reason.trim(),
      } satisfies MovementInsert)
      .select()
      .single();

    if (movErr || !movement) throw movErr ?? new Error('Error al insertar la merma.');

    // 2. Actualizar stock (deducción)
    const { error: stockErr } = await supabase
      .from('product_presentations')
      .update({ stock: currentStock - Math.abs(quantity) })
      .eq('id', presentationId);

    if (stockErr) throw stockErr;

    return movement;
  },

  /**
   * Registra un ajuste de inventario (discrepancia física vs sistema).
   * delta = physicalStock - systemStock (puede ser positivo o negativo).
   */
  async recordAdjustment(params: {
    presentationId: string;
    productId: string;
    physicalStock: number;
    systemStock: number;
    reason?: string;
  }): Promise<MovementRow> {
    const { presentationId, productId, physicalStock, systemStock, reason } = params;

    const delta = physicalStock - systemStock;
    const autoReason = `Ajuste: físico ${physicalStock} vs sistema ${systemStock}`;

    // 1. Insertar movimiento con el delta real y type='ajuste' (según constraint BD)
    const { data: movement, error: movErr } = await supabase
      .from('inventory_movements')
      .insert({
        presentation_id: presentationId,
        product_id: productId,
        quantity: delta,
        type: 'ajuste' satisfies MovementType,
        reason: reason?.trim() || autoReason,
      } satisfies MovementInsert)
      .select()
      .single();

    if (movErr || !movement) throw movErr ?? new Error('Error al insertar el ajuste.');

    // 2. Establecer el stock al valor físico real
    const { error: stockErr } = await supabase
      .from('product_presentations')
      .update({ stock: physicalStock })
      .eq('id', presentationId);

    if (stockErr) throw stockErr;

    return movement;
  },
};
