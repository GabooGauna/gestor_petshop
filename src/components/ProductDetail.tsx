import React, { useState } from 'react';
import { productService, type CatalogPresentationUpdate } from '../services/productService';
import type { Database } from '../types/database.types';
import { Pencil, X, Check, ChevronDown, ChevronUp, AlertTriangle, Calculator, Plus, Layers, Archive, RotateCcw } from 'lucide-react';
import Swal from 'sweetalert2';

interface Presentation {
  id: string;
  name: string;
  price: number;
  price_per_kg: number | null;
  cost: number;
  stock: number;
  weight_kg: number | null;
  status: string;
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
  categories: Database['public']['Tables']['categories']['Row'][];
  idx: number;
  onUpdated: () => void;
}

// Estado de edición interno (todos los campos como string para los inputs)
interface EditState {
  name: string;
  priceBulk: string;    // precio de venta del bulto completo
  margenPct: string;    // margen % extra para venta suelta
  weight_kg: string;
  priceUnit: string;    // solo para tipo 'unit'
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') return error.message;
  return fallback;
}

function calcPricePerKg(priceBulk: number, weightKg: number, margenPct: number): number {
  if (!priceBulk || !weightKg) return 0;
  const basePorKg = priceBulk / weightKg;
  return basePorKg * (1 + margenPct / 100);
}

export function ProductDetail({ product, categoryName, categories, idx, onUpdated }: ProductDetailProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  // Estado para crear una nueva presentación inline
  const [showAddPres, setShowAddPres] = useState(false);
  const [newPresName, setNewPresName] = useState('');
  const [newPresWeight, setNewPresWeight] = useState(product.type === 'weight' ? '15' : '');
  const [newPresCost, setNewPresCost] = useState('');
  const [newPresPrice, setNewPresPrice] = useState('');
  const [newPresStock, setNewPresStock] = useState('0');
  const [newPresMargen, setNewPresMargen] = useState('10');
  const [savingNewPres, setSavingNewPres] = useState(false);
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState(product.category_id ?? '');
  const [savingCategory, setSavingCategory] = useState(false);

  const isWeightProduct = product.type === 'weight';
  const presentations = product.product_presentations || [];
  const activePresentations = presentations.filter(presentation => presentation.status !== 'inactive');
  const archivedPresentations = presentations.filter(presentation => presentation.status === 'inactive');
  const activeStock = activePresentations.reduce((sum, presentation) => sum + Number(presentation.stock || 0), 0);
  const archivedStock = archivedPresentations.reduce((sum, presentation) => sum + Number(presentation.stock || 0), 0);

  const startEdit = (pres: Presentation) => {
    setEditingId(pres.id);

    let inferredMargen = 10;
    if (isWeightProduct && pres.price_per_kg && pres.price && pres.weight_kg) {
      const base = pres.price / pres.weight_kg;
      const m = ((pres.price_per_kg / base) - 1) * 100;
      if (m >= 0 && m <= 200) inferredMargen = Math.round(m);
    }

    setEditState({
      name: pres.name,
      priceBulk: pres.price > 0 ? String(pres.price) : '',
      margenPct: String(inferredMargen),
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
    if (isWeightProduct && Number(editState.weight_kg) <= 0) {
      await Swal.fire({
        icon: 'warning',
        title: 'Revisá el peso del bulto',
        text: 'El peso debe ser mayor que cero. El stock se modifica desde el apartado Inventario.',
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#2563EB',
      });
      return;
    }
    setSaving(true);
    try {
      const priceBulk = Number(editState.priceBulk) || 0;
      const weightKg = Number(editState.weight_kg) || 0;
      const margenPct = Number(editState.margenPct) || 0;
      const pricePerKgCalc = isWeightProduct
        ? calcPricePerKg(priceBulk, weightKg, margenPct)
        : null;

      const updates: CatalogPresentationUpdate = {
        name: editState.name,
        price: isWeightProduct ? priceBulk : Number(editState.priceUnit) || 0,
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
      await Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: errorMessage(err, 'Revisá los datos e intentá nuevamente.'), confirmButtonColor: '#2563EB' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateNewPresentation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresName.trim()) return;

    const initialStock = Number(newPresStock || '0');
    const stockDecimals = (newPresStock.split('.')[1] ?? '').length;
    if (!Number.isFinite(initialStock) || initialStock < 0 || stockDecimals > 3 || (!isWeightProduct && !Number.isInteger(initialStock))) {
      await Swal.fire({
        icon: 'warning',
        title: 'Revisá el stock inicial',
        text: isWeightProduct
          ? 'Usá cero o un valor positivo con hasta tres decimales.'
          : 'Para productos por unidad, el stock debe ser un número entero igual o mayor que cero.',
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#2563EB',
      });
      return;
    }

    setSavingNewPres(true);
    try {
      const costNum = Number(newPresCost) || 0;
      const priceNum = Number(newPresPrice) || 0;
      const weightNum = isWeightProduct ? Number(newPresWeight) || 0 : null;
      const margenNum = Number(newPresMargen) || 0;
      const pricePerKgCalc = isWeightProduct && weightNum && priceNum
        ? calcPricePerKg(priceNum, weightNum, margenNum)
        : null;

      await productService.createPresentation({
        product_id: product.id,
        name: newPresName.trim(),
        cost: costNum,
        price: priceNum,
        price_per_kg: pricePerKgCalc,
        weight_kg: weightNum,
        stock: initialStock,
      });

      setShowAddPres(false);
      setNewPresName('');
      setNewPresCost('');
      setNewPresPrice('');
      setNewPresStock('0');
      onUpdated();
    } catch (err: unknown) {
      await Swal.fire({ icon: 'error', title: 'No se pudo crear la presentación', text: errorMessage(err, 'Revisá los datos e intentá nuevamente.'), confirmButtonColor: '#2563EB' });
    } finally {
      setSavingNewPres(false);
    }
  };

  const handleArchiveProduct = async () => {
    const confirmation = await Swal.fire({
      icon: 'warning',
      title: '¿Dar de baja este producto?',
      text: `“${product.name}” dejará de estar disponible para nuevas operaciones. Sus presentaciones, stock, ventas, compras y movimientos se conservarán en el historial.`,
      showCancelButton: true,
      focusCancel: true,
      reverseButtons: true,
      confirmButtonText: 'Sí, dar de baja',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#DC2626',
      cancelButtonColor: '#64748B',
    });
    if (!confirmation.isConfirmed) return;
    setChangingStatusId(product.id);
    try {
      await productService.deleteProduct(product.id);
      onUpdated();
      await Swal.fire({ icon: 'success', title: 'Producto dado de baja', text: `“${product.name}” quedó archivado y ya no aparece en el catálogo activo.`, confirmButtonColor: '#2563EB' });
    } catch (err: unknown) {
      await Swal.fire({ icon: 'error', title: 'No se pudo dar de baja', text: errorMessage(err, 'No se pudo dar de baja el producto.'), confirmButtonColor: '#2563EB' });
    } finally {
      setChangingStatusId(null);
    }
  };

  const handleArchivePresentation = async (presentation: Presentation) => {
    const confirmation = await Swal.fire({
      icon: 'warning',
      title: '¿Archivar esta presentación?',
      text: `“${presentation.name}” dejará de estar disponible para ventas, compras, ajustes y mermas. Su stock, costo e historial se conservarán y podrás reactivarla.`,
      showCancelButton: true,
      focusCancel: true,
      reverseButtons: true,
      confirmButtonText: 'Sí, archivar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#D97706',
      cancelButtonColor: '#64748B',
    });
    if (!confirmation.isConfirmed) return;
    setChangingStatusId(presentation.id);
    try {
      await productService.archivePresentation(presentation.id);
      onUpdated();
      await Swal.fire({ icon: 'success', title: 'Presentación archivada', text: `“${presentation.name}” quedó fuera de las operaciones. Su stock, costo e historial siguen conservados.`, confirmButtonColor: '#2563EB' });
    } catch (err: unknown) {
      await Swal.fire({ icon: 'error', title: 'No se pudo archivar', text: errorMessage(err, 'No se pudo archivar la presentación.'), confirmButtonColor: '#2563EB' });
    } finally {
      setChangingStatusId(null);
    }
  };

  const handleReactivatePresentation = async (presentation: Presentation) => {
    setChangingStatusId(presentation.id);
    try {
      await productService.reactivatePresentation(presentation.id);
      onUpdated();
      await Swal.fire({ icon: 'success', title: 'Presentación reactivada', text: `“${presentation.name}” vuelve a estar disponible con el mismo stock y costo.`, confirmButtonColor: '#059669' });
    } catch (err: unknown) {
      await Swal.fire({ icon: 'error', title: 'No se pudo reactivar', text: errorMessage(err, 'No se pudo reactivar la presentación.'), confirmButtonColor: '#2563EB' });
    } finally {
      setChangingStatusId(null);
    }
  };

  const startCategoryEdit = () => {
    setCategoryDraft(product.category_id ?? '');
    setEditingCategory(true);
  };

  const saveCategory = async () => {
    if (categoryDraft === (product.category_id ?? '')) {
      setEditingCategory(false);
      return;
    }

    setSavingCategory(true);
    try {
      await productService.updateProduct(product.id, { category_id: categoryDraft || null });
      setEditingCategory(false);
      onUpdated();
    } catch (err: unknown) {
      await Swal.fire({
        icon: 'error',
        title: 'No se pudo cambiar la categoría',
        text: errorMessage(err, 'Revisá la categoría e intentá nuevamente.'),
        confirmButtonColor: '#2563EB',
      });
    } finally {
      setSavingCategory(false);
    }
  };

  const hasMissingPrice = activePresentations.length === 0 || activePresentations.some(p => {
    const effective = isWeightProduct ? (p.price_per_kg ?? p.price) : p.price;
    return !effective || effective === 0;
  });

  // Preview del cálculo en tiempo real para edición
  const previewPricePerKg: number | null = (() => {
    if (!editState || !isWeightProduct) return null;
    const b = Number(editState.priceBulk);
    const w = Number(editState.weight_kg);
    const m = Number(editState.margenPct);
    if (b <= 0 || w <= 0) return null;
    return calcPricePerKg(b, w, m);
  })();

  const previewCostPerKg: number | null = (() => {
    if (!editState || !isWeightProduct) return null;
    const c = Number(presentations.find(presentation => presentation.id === editingId)?.cost);
    const w = Number(editState.weight_kg);
    if (c <= 0 || w <= 0) return null;
    return c / w;
  })();

  // Preview para nueva presentación
  const newPresPricePerKgCalc = (() => {
    if (!isWeightProduct) return null;
    const b = Number(newPresPrice);
    const w = Number(newPresWeight);
    const m = Number(newPresMargen);
    if (!b || !w) return null;
    return calcPricePerKg(b, w, m);
  })();

  return (
    <tr className="group block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-colors hover:border-slate-300 md:table-row md:rounded-none md:border-x-0 md:border-t-0 md:shadow-none md:hover:bg-slate-50/50">
      {/* Código */}
      <td className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 text-sm text-slate-500 md:table-cell md:border-b-0 md:px-6 md:py-3 md:pt-4 md:align-top">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 md:hidden">Código</span>
        <span>P{String(idx + 1).padStart(3, '0')}</span>
      </td>

      {/* Producto */}
      <td className="px-4 py-3 md:table-cell md:px-6 md:py-3 md:pt-4 md:align-top">
        <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-slate-400 md:hidden">Producto</span>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200 text-slate-500 text-xs font-bold">
            {product.name.charAt(0)}
          </div>
          <div>
            <div className="font-medium text-slate-800 text-sm">{product.name}</div>
            {hasMissingPrice && (
              <div className="flex items-center gap-1 text-amber-600 text-xs mt-0.5">
                <AlertTriangle className="w-3 h-3" />
                {activePresentations.length === 0 ? 'Sin presentaciones activas' : 'Precio sin configurar'}
              </div>
            )}
          </div>
        </div>
      </td>

      {/* Categoría */}
      <td className="flex items-start justify-between gap-3 border-t border-slate-100 px-4 py-2.5 text-sm text-slate-600 md:table-cell md:border-t-0 md:px-6 md:py-3 md:pt-3 md:align-top">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 md:hidden">Categoría</span>
        {editingCategory ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 md:min-w-40">
            <select
              value={categoryDraft}
              onChange={event => setCategoryDraft(event.target.value)}
              disabled={savingCategory}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
              aria-label={`Categoría de ${product.name}`}
              data-testid={`product-category-select-${product.id}`}
            >
              <option value="">Sin categoría</option>
              {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <button
              type="button"
              onClick={() => void saveCategory()}
              disabled={savingCategory}
              className="rounded-lg p-1.5 text-emerald-600 transition-colors hover:bg-emerald-50 hover:text-emerald-800 disabled:opacity-50"
              aria-label={`Guardar categoría de ${product.name}`}
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setEditingCategory(false)}
              disabled={savingCategory}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
              aria-label={`Cancelar categoría de ${product.name}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">{categoryName}</span>
            <button
              type="button"
              onClick={startCategoryEdit}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-[#2563EB]"
              aria-label={`Editar categoría de ${product.name}`}
              title="Cambiar categoría"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </td>

      {/* Tipo */}
      <td className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-sm capitalize text-slate-600 md:table-cell md:border-t-0 md:px-6 md:py-3 md:pt-4 md:align-top">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 md:hidden">Tipo</span>
        <span>{isWeightProduct ? 'Por Peso' : 'Unidad'}</span>
      </td>

      {/* Stock */}
      <td className="flex items-start justify-between border-t border-slate-100 px-4 py-2.5 md:table-cell md:border-t-0 md:px-6 md:py-3 md:pt-4 md:align-top" data-testid={`product-stock-${product.id}`}>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 md:hidden">Stock total</span>
        <div className="flex flex-col">
          <span className={`text-sm font-semibold font-mono ${
            activeStock <= 0
              ? 'text-red-500' 
              : 'text-slate-800'
          }`}>
            {activeStock.toLocaleString('es-AR', {
              minimumFractionDigits: isWeightProduct ? 0 : 0,
              maximumFractionDigits: isWeightProduct ? 3 : 0,
            })} {isWeightProduct ? 'kg' : 'uds'}
          </span>
          <span className="text-[11px] text-slate-400">
            Disponible en {activePresentations.length === 1 ? '1 presentación activa' : `${activePresentations.length} presentaciones activas`}
          </span>
          {archivedStock > 0 && (
            <span className="mt-1 text-[11px] font-medium text-slate-500" data-testid={`archived-stock-${product.id}`}>
              {archivedStock.toLocaleString('es-AR', { maximumFractionDigits: isWeightProduct ? 3 : 0 })} {isWeightProduct ? 'kg' : 'uds'} inmovilizados
            </span>
          )}
        </div>
      </td>

      {/* Estado + Presentaciones */}
      <td className="border-t border-slate-100 px-4 py-3 md:table-cell md:border-t-0 md:px-6 md:py-3 md:align-top">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-md">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
              Activo
            </span>
            {presentations.length > 0 ? (
              <button
                onClick={() => setExpanded(e => !e)}
                className="inline-flex items-center gap-1 text-xs text-[#2563EB] hover:text-blue-700 font-medium transition-colors"
                data-testid={`toggle-presentations-${product.id}`}
              >
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {presentations.length} presentación{presentations.length !== 1 ? 'es' : ''}
              </button>
            ) : (
              <button
                onClick={() => { setExpanded(true); setShowAddPres(true); }}
                className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-1 rounded-md font-medium transition-colors"
                data-testid={`add-first-presentation-${product.id}`}
              >
                <Plus className="w-3.5 h-3.5" />
                Configurar presentación
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleArchiveProduct()}
              disabled={changingStatusId !== null}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              aria-label={`Dar de baja producto ${product.name}`}
              title="Dar de baja producto"
            >
              <Archive className="h-3.5 w-3.5" />
              Dar de baja
            </button>
          </div>

          {expanded && (
            <div className="mt-1 space-y-3">
              {presentations.map(pres => {
                const isEditing = editingId === pres.id;
                const isArchived = pres.status === 'inactive';
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
                          <div>
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
                          </div>

                          {/* Precio y costo vigente del bulto */}
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                            <div data-testid={`current-cost-${pres.id}`}>
                              <span className="block text-xs font-semibold text-slate-500 mb-1">Costo de reposición vigente</span>
                              <div className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">
                                {pres.cost > 0 ? `$${Number(pres.cost).toLocaleString('es-AR')}` : 'Sin costo configurado'}
                              </div>
                            </div>
                          </div>

                          <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] leading-4 text-blue-800 sm:col-span-2">
                            El costo vigente se actualiza únicamente al confirmar una compra. Las ventas ya registradas conservan el costo histórico utilizado.
                          </p>

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
                            <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
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
                                  {Number(editState.priceBulk) > 0 && Number(editState.weight_kg) > 0
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
                          </div>
                        </>
                      ) : (
                        // ── Producto por unidad ─────────────────────────────
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                          <div data-testid={`current-cost-${pres.id}`}>
                            <span className="block text-xs font-semibold text-slate-500 mb-1">Costo de reposición vigente</span>
                            <div className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">
                              {pres.cost > 0 ? `$${Number(pres.cost).toLocaleString('es-AR')}` : 'Sin costo configurado'}
                            </div>
                          </div>
                          <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] leading-4 text-blue-800 sm:col-span-2">
                            El costo vigente se actualiza únicamente al confirmar una compra. Las ventas ya registradas conservan el costo histórico utilizado.
                          </p>
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
                    className={`flex max-w-lg flex-col items-stretch gap-3 rounded-lg border p-3 shadow-2xs sm:flex-row sm:items-center sm:justify-between ${isArchived ? 'border-slate-300 bg-slate-100/80' : 'border-slate-200 bg-white'}`}
                    data-testid={`presentation-${pres.id}`}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-sm font-medium ${isArchived ? 'text-slate-600' : 'text-slate-700'}`}>{pres.name}</span>
                        <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${isArchived ? 'border-slate-300 bg-white text-slate-600' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${isArchived ? 'bg-slate-400' : 'bg-emerald-500'}`} />
                          {isArchived ? 'Archivada' : 'Activa'}
                        </span>
                      </div>
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
                    <div className="flex shrink-0 items-center justify-end gap-1 sm:ml-3">
                      <button
                        onClick={() => startEdit(pres)}
                        disabled={isArchived || changingStatusId !== null}
                        data-testid={`edit-presentation-${pres.id}`}
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-[#2563EB] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                        title={isArchived ? 'Reactivá la presentación para editarla' : 'Editar presentación'}
                        aria-label={`Editar presentación ${pres.name}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {isArchived ? (
                        <button type="button" onClick={() => void handleReactivatePresentation(pres)} disabled={changingStatusId !== null} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50" aria-label={`Reactivar presentación ${pres.name}`} data-testid={`reactivate-presentation-${pres.id}`}>
                          <RotateCcw className="h-3.5 w-3.5" />{changingStatusId === pres.id ? 'Reactivando…' : 'Reactivar'}
                        </button>
                      ) : (
                        <button type="button" onClick={() => void handleArchivePresentation(pres)} disabled={changingStatusId !== null} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50" title="Archivar presentación" aria-label={`Archivar presentación ${pres.name}`} data-testid={`archive-presentation-${pres.id}`}>
                          <Archive className="h-3.5 w-3.5" />{changingStatusId === pres.id ? 'Archivando…' : 'Archivar'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Formulario / Botón para agregar una nueva presentación */}
              {showAddPres ? (
                <form
                  onSubmit={handleCreateNewPresentation}
                  className="border border-blue-200 rounded-xl bg-blue-50/20 p-4 space-y-3 max-w-lg"
                  data-testid="add-presentation-form"
                >
                  <div className="flex items-center justify-between pb-1 border-b border-blue-100">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-[#2563EB]" />
                      Nueva Presentación
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAddPres(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre de la variante</label>
                      <input
                        required
                        type="text"
                        value={newPresName}
                        onChange={e => setNewPresName(e.target.value)}
                        placeholder={isWeightProduct ? 'Ej: Bolsa 15kg' : 'Ej: Correa larga'}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-[#2563EB]"
                        data-testid="new-pres-name-input"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Stock inicial ({isWeightProduct ? 'kg' : 'uds'})</label>
                      <input
                        required
                        type="number"
                        min="0"
                        step={isWeightProduct ? '0.001' : '1'}
                        value={newPresStock}
                        onChange={e => setNewPresStock(e.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-[#2563EB]"
                        data-testid="new-pres-stock-input"
                      />
                    </div>
                    <p className="text-[11px] leading-4 text-slate-500 sm:col-span-2">El saldo quedará registrado como apertura de esta presentación en el Kardex.</p>
                  </div>

                  {isWeightProduct && (
                    <div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Peso del bulto (kg)</label>
                        <input
                          type="number" step="0.1" min="0.1"
                          value={newPresWeight}
                          onChange={e => setNewPresWeight(e.target.value)}
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-[#2563EB]"
                          placeholder="15"
                          data-testid="new-pres-weight-input"
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Precio venta ($)</label>
                      <input
                        type="number" step="0.01" min="0"
                        value={newPresPrice}
                        onChange={e => setNewPresPrice(e.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-[#10B981]"
                        placeholder="0"
                        data-testid="new-pres-price-input"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Costo compra ($)</label>
                      <input
                        type="number" step="0.01" min="0"
                        value={newPresCost}
                        onChange={e => setNewPresCost(e.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-[#2563EB]"
                        placeholder="0"
                        data-testid="new-pres-cost-input"
                      />
                    </div>
                  </div>

                  {isWeightProduct && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Margen adicional venta suelta (%)
                      </label>
                      <input
                        type="number" min="0" max="100"
                        value={newPresMargen}
                        onChange={e => setNewPresMargen(e.target.value)}
                        className="w-24 px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-[#10B981]"
                      />
                      {newPresPricePerKgCalc != null && newPresPricePerKgCalc > 0 && (
                        <p className="text-[11px] text-green-700 font-semibold mt-1">
                          Precio suelto calculado: ${newPresPricePerKgCalc.toFixed(2)}/kg
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAddPres(false)}
                      className="px-3 py-1.5 text-xs bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={savingNewPres}
                      className="px-4 py-1.5 text-xs bg-[#2563EB] text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 font-medium"
                      data-testid="submit-new-presentation-btn"
                    >
                      {savingNewPres ? 'Guardando...' : 'Crear presentación'}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAddPres(true)}
                  className="inline-flex items-center gap-1.5 text-xs text-[#2563EB] hover:text-blue-700 font-medium py-1.5 px-2.5 rounded-lg hover:bg-blue-50 border border-dashed border-blue-200 transition-colors"
                  data-testid={`add-presentation-btn-${product.id}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar otra presentación
                </button>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
