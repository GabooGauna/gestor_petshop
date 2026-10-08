import React, { useState } from 'react';
import { productService } from '../services/productService';
import type { Database } from '../types/database.types';
import { Pencil, X, Check, ChevronDown, ChevronUp, AlertTriangle, Calculator, Info } from 'lucide-react';

type PresentationUpdate = Database['public']['Tables']['product_presentations']['Update'];

interface Presentation {
  id: string;
  name: string;
  price: number;
  price_per_kg: number | null;
  cost: number;
  stock: number;
  weight_kg: number | null;
}

interface Product {
  id: string;
  name: string;
  type: string | null;
  category_id: string | null;
  product_presentations: Presentation[];
}

interface ProductDetailProps {
  product: Product;
  categoryName: string;
  idx: number;
  onUpdated: () => void;
}

// Estado de edición interno (todos los campos como string para los inputs)
interface EditState {
  name: string;
  priceBulk: string;    // precio de venta del bulto completo
  cost: string;         // costo del bulto
  margenPct: string;    // margen % extra para venta suelta
  stock: string;
  weight_kg: string;
  // precio_por_kg se CALCULA: (priceBulk / weight_kg) * (1 + margenPct/100)
  // para productos de unidad, se ingresa directamente
  priceUnit: string;    // solo para tipo 'unit'
}

function calcPricePerKg(priceBulk: number, weightKg: number, margenPct: number): number {
  if (!priceBulk || !weightKg) return 0;
  const basePorKg = priceBulk / weightKg;
  return basePorKg * (1 + margenPct / 100);
}

export function ProductDetail({ product, categoryName, idx, onUpdated }: ProductDetailProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const isWeightProduct = product.type === 'weight';

  const startEdit = (pres: Presentation) => {
    setEditingId(pres.id);

    // Si ya tenía price_per_kg guardado, tratar de inferir el margen
    // price_per_kg = (price / weight_kg) * (1 + margen/100)
    // margen = (price_per_kg * weight_kg / price - 1) * 100
    let inferredMargen = 10; // default 10%
    if (isWeightProduct && pres.price_per_kg && pres.price && pres.weight_kg) {
      const base = pres.price / pres.weight_kg;
      const m = ((pres.price_per_kg / base) - 1) * 100;
      if (m >= 0 && m <= 200) inferredMargen = Math.round(m);
    }

    setEditState({
      name: pres.name,
      priceBulk: pres.price > 0 ? String(pres.price) : '',
      cost: pres.cost > 0 ? String(pres.cost) : '',
      margenPct: String(inferredMargen),
      stock: String(pres.stock),
      weight_kg: pres.weight_kg != null ? String(pres.weight_kg) : '',
      priceUnit: pres.price > 0 ? String(pres.price) : '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditState(null);
  };

  const setProp = (key: keyof EditState, value: string) => {
    setEditState(prev => prev ? { ...prev, [key]: value } : null);
  };

  const saveEdit = async (id: string) => {
    if (!editState) return;
    setSaving(true);
    try {
      const priceBulk = Number(editState.priceBulk) || 0;
      const weightKg = Number(editState.weight_kg) || 0;
      const margenPct = Number(editState.margenPct) || 0;
      const pricePerKgCalc = isWeightProduct
        ? calcPricePerKg(priceBulk, weightKg, margenPct)
        : null;

      const updates: PresentationUpdate = {
        name: editState.name,
        price: isWeightProduct ? priceBulk : Number(editState.priceUnit) || 0,
        cost: Number(editState.cost) || 0,
        stock: Number(editState.stock) || 0,
        ...(isWeightProduct && {
          price_per_kg: pricePerKgCalc || null,
          weight_kg: weightKg || null,
        }),
      };

      await productService.updatePresentation(id, updates);
      setEditingId(null);
      setEditState(null);
      onUpdated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      alert('Error al guardar: ' + msg);
    } finally {
      setSaving(false);
    }
  };

  const presentations = product.product_presentations || [];
  const hasMissingPrice = presentations.some(p => {
    const effective = isWeightProduct ? (p.price_per_kg ?? p.price) : p.price;
    return !effective || effective === 0;
  });

  // Preview del cálculo en tiempo real
  const previewPricePerKg: number | null = (() => {
    if (!editState || !isWeightProduct) return null;
    const b = Number(editState.priceBulk);
    const w = Number(editState.weight_kg);
    const m = Number(editState.margenPct);
    if (!b || !w) return null;
    return calcPricePerKg(b, w, m);
  })();

  // Costo por kg (solo informativo)
  const previewCostPerKg: number | null = (() => {
    if (!editState || !isWeightProduct) return null;
    const c = Number(editState.cost);
    const w = Number(editState.weight_kg);
    if (!c || !w) return null;
    return c / w;
  })();

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors group">
      {/* Código */}
      <td className="py-3 px-6 text-slate-500 text-sm align-top pt-4">
        P{String(idx + 1).padStart(3, '0')}
      </td>

      {/* Producto */}
      <td className="py-3 px-6 align-top pt-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200 text-slate-500 text-xs font-bold">
            {product.name.charAt(0)}
          </div>
          <div>
            <div className="font-medium text-slate-800 text-sm">{product.name}</div>
            {hasMissingPrice && (
              <div className="flex items-center gap-1 text-amber-600 text-xs mt-0.5">
                <AlertTriangle className="w-3 h-3" />
                Precio sin configurar
              </div>
            )}
          </div>
        </div>
      </td>

      {/* Categoría */}
      <td className="py-3 px-6 text-sm text-slate-600 align-top pt-4">{categoryName}</td>

      {/* Tipo */}
      <td className="py-3 px-6 text-sm text-slate-600 capitalize align-top pt-4">
        {isWeightProduct ? 'Por Peso' : 'Unidad'}
      </td>

      {/* Estado + Presentaciones */}
      <td className="py-3 px-6 align-top pt-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-md">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              Activo
            </span>
            {presentations.length > 0 && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="inline-flex items-center gap-1 text-xs text-[#2563EB] hover:text-blue-700 font-medium transition-colors"
                data-testid={`toggle-presentations-${product.id}`}
              >
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {presentations.length} presentación{presentations.length !== 1 ? 'es' : ''}
              </button>
            )}
          </div>

          {expanded && (
            <div className="mt-1 space-y-3">
              {presentations.map(pres => {
                const isEditing = editingId === pres.id;
                const effectivePrice = isWeightProduct ? (pres.price_per_kg ?? pres.price) : pres.price;
                const priceOk = effectivePrice && effectivePrice > 0;

                if (isEditing && editState) {
                  // ── MODO EDICIÓN ────────────────────────────────────────────
                  return (
                    <div key={pres.id} className="border border-blue-200 rounded-xl bg-blue-50/30 p-4 space-y-3 max-w-lg">
                      {/* Nombre */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Nombre de la presentación</label>
                        <input
                          type="text"
                          value={editState.name}
                          onChange={e => setProp('name', e.target.value)}
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#2563EB] outline-none bg-white"
                        />
                      </div>

                      {isWeightProduct ? (
                        <>
                          {/* Peso del bulto */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 mb-1">Peso del bulto (kg)</label>
                              <div className="relative">
                                <input
                                  type="number" step="0.1" min="0"
                                  value={editState.weight_kg}
                                  onChange={e => setProp('weight_kg', e.target.value)}
                                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#2563EB] outline-none bg-white"
                                  placeholder="20"
                                  data-testid={`edit-weight-kg-${pres.id}`}
                                />
                              </div>
                            </div>
                            {/* Stock */}
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 mb-1">Stock (kg)</label>
                              <input
                                type="number" step="0.001" min="0"
                                value={editState.stock}
                                onChange={e => setProp('stock', e.target.value)}
                                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#2563EB] outline-none bg-white"
                                placeholder="0"
                              />
                            </div>
                          </div>

                          {/* Precio y costo del bulto */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 mb-1">
                                Precio de venta del bulto ($)
                              </label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                                <input
                                  type="number" step="0.01" min="0"
                                  value={editState.priceBulk}
                                  onChange={e => setProp('priceBulk', e.target.value)}
                                  className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#10B981] outline-none bg-white"
                                  placeholder="30000"
                                  data-testid={`edit-price-bulk-${pres.id}`}
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 mb-1">
                                Costo del bulto ($)
                              </label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                                <input
                                  type="number" step="0.01" min="0"
                                  value={editState.cost}
                                  onChange={e => setProp('cost', e.target.value)}
                                  className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#2563EB] outline-none bg-white"
                                  placeholder="25000"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Margen para venta suelta */}
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">
                              Margen adicional para venta suelta (%)
                              <span className="ml-1 text-slate-400 font-normal">— recargo por vender fraccionado</span>
                            </label>
                            <div className="flex items-center gap-3">
                              <input
                                type="range" min="0" max="100" step="1"
                                value={editState.margenPct}
                                onChange={e => setProp('margenPct', e.target.value)}
                                className="flex-1 accent-[#10B981]"
                              />
                              <div className="relative w-20">
                                <input
                                  type="number" min="0" max="100" step="1"
                                  value={editState.margenPct}
                                  onChange={e => setProp('margenPct', e.target.value)}
                                  className="w-full pr-5 pl-2 py-1 border border-slate-200 rounded-lg text-sm text-center focus:ring-2 focus:ring-[#10B981] outline-none bg-white"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">%</span>
                              </div>
                            </div>
                          </div>

                          {/* Preview del cálculo */}
                          <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-1.5">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-2">
                              <Calculator className="w-3.5 h-3.5" />
                              Vista previa del cálculo
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div className="text-center p-2 bg-slate-50 rounded-lg">
                                <div className="text-slate-400 text-[10px] mb-0.5">Costo/kg</div>
                                <div className="font-semibold text-slate-700">
                                  {previewCostPerKg != null
                                    ? `$${previewCostPerKg.toFixed(2)}`
                                    : '—'}
                                </div>
                              </div>
                              <div className="text-center p-2 bg-slate-50 rounded-lg">
                                <div className="text-slate-400 text-[10px] mb-0.5">Base/kg (sin margen)</div>
                                <div className="font-semibold text-slate-700">
                                  {editState.priceBulk && editState.weight_kg
                                    ? `$${(Number(editState.priceBulk) / Number(editState.weight_kg)).toFixed(2)}`
                                    : '—'}
                                </div>
                              </div>
                              <div className="text-center p-2 bg-green-50 border border-green-200 rounded-lg">
                                <div className="text-green-600 text-[10px] mb-0.5 font-medium">Precio/kg suelto ✓</div>
                                <div className="font-bold text-green-700 text-sm">
                                  {previewPricePerKg != null && previewPricePerKg > 0
                                    ? `$${previewPricePerKg.toFixed(2)}`
                                    : '—'}
                                </div>
                              </div>
                            </div>
                            {previewPricePerKg != null && previewCostPerKg != null && previewPricePerKg > 0 && (
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-1">
                                <Info className="w-3 h-3" />
                                Ganancia por kg vendido suelto: ${(previewPricePerKg - previewCostPerKg).toFixed(2)}
                                {' '}({(((previewPricePerKg - previewCostPerKg) / previewCostPerKg) * 100).toFixed(1)}% sobre costo)
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        // ── Producto por unidad ─────────────────────────────
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">Precio de venta ($)</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                              <input
                                type="number" step="0.01" min="0"
                                value={editState.priceUnit}
                                onChange={e => setProp('priceUnit', e.target.value)}
                                className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#10B981] outline-none bg-white"
                                placeholder="0.00"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">Costo ($)</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                              <input
                                type="number" step="0.01" min="0"
                                value={editState.cost}
                                onChange={e => setProp('cost', e.target.value)}
                                className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#2563EB] outline-none bg-white"
                                placeholder="0.00"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">Stock (uds)</label>
                            <input
                              type="number" step="1" min="0"
                              value={editState.stock}
                              onChange={e => setProp('stock', e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#2563EB] outline-none bg-white"
                              placeholder="0"
                            />
                          </div>
                        </div>
                      )}

                      {/* Botones guardar/cancelar */}
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          onClick={cancelEdit}
                          className="px-3 py-1.5 text-xs bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => saveEdit(pres.id)}
                          disabled={saving}
                          data-testid={`save-presentation-${pres.id}`}
                          className="px-4 py-1.5 text-xs bg-[#10B981] text-white rounded-lg hover:bg-[#059669] transition-colors disabled:opacity-50 flex items-center gap-1.5 font-medium"
                        >
                          <Check className="w-3.5 h-3.5" />
                          {saving ? 'Guardando...' : 'Guardar'}
                        </button>
                      </div>
                    </div>
                  );
                }

                // ── MODO VISUALIZACIÓN ─────────────────────────────────────
                return (
                  <div
                    key={pres.id}
                    className="border border-slate-200 rounded-lg bg-white p-3 flex items-center justify-between max-w-lg"
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-sm font-medium text-slate-700">{pres.name}</span>
                      <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                        {isWeightProduct ? (
                          <>
                            <span>
                              <span className="text-slate-400">$/kg suelto:</span>{' '}
                              <span className={priceOk ? 'text-slate-700 font-semibold' : 'text-amber-600 font-semibold'}>
                                {pres.price_per_kg != null
                                  ? `$${Number(pres.price_per_kg).toFixed(2)}`
                                  : <span className="flex items-center gap-0.5"><AlertTriangle className="w-3 h-3 inline" /> sin precio</span>
                                }
                              </span>
                            </span>
                            <span>
                              <span className="text-slate-400">Bulto:</span>{' '}
                              {pres.price > 0 ? `$${Number(pres.price).toLocaleString('es-AR')}` : '—'}
                            </span>
                            <span>
                              <span className="text-slate-400">Costo:</span>{' '}
                              {pres.cost > 0 ? `$${Number(pres.cost).toLocaleString('es-AR')}` : '—'}
                            </span>
                            <span>
                              <span className="text-slate-400">Stock:</span>{' '}
                              <span className={Number(pres.stock) <= 0 ? 'text-red-500' : ''}>
                                {Number(pres.stock).toLocaleString('es-AR')} kg
                              </span>
                            </span>
                          </>
                        ) : (
                          <>
                            <span>
                              <span className="text-slate-400">Precio:</span>{' '}
                              <span className={priceOk ? 'text-slate-700 font-semibold' : 'text-amber-600 font-semibold'}>
                                {pres.price > 0 ? `$${Number(pres.price).toLocaleString('es-AR')}` : '—'}
                              </span>
                            </span>
                            <span>
                              <span className="text-slate-400">Costo:</span>{' '}
                              {pres.cost > 0 ? `$${Number(pres.cost).toLocaleString('es-AR')}` : '—'}
                            </span>
                            <span>
                              <span className="text-slate-400">Stock:</span>{' '}
                              <span className={Number(pres.stock) <= 0 ? 'text-red-500' : ''}>
                                {Number(pres.stock).toLocaleString('es-AR')} uds
                              </span>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => startEdit(pres)}
                      data-testid={`edit-presentation-${pres.id}`}
                      className="ml-3 p-1.5 text-slate-400 hover:text-[#2563EB] hover:bg-blue-50 rounded-lg transition-colors shrink-0"
                      title="Editar presentación"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
