import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Boxes, Calculator, Plus, RefreshCw, ShoppingCart, Trash2 } from 'lucide-react';
import { productService } from '../services/productService';
import { saleCalculations, saleService, type SaleItemPayload, type SaleMode } from '../services/saleService';
import type { Database } from '../types/database.types';
import Swal from 'sweetalert2';

type Product = Database['public']['Tables']['products']['Row'] & { product_presentations: Database['public']['Tables']['product_presentations']['Row'][] };
type PaymentMethod = 'efectivo' | 'transferencia' | 'debito' | 'credito' | 'mercado_pago' | 'otro';
interface TicketItem { presentationId: string; productName: string; presentationName: string; mode: SaleMode; input: string; quantity: number; subtotal: number; cost: number; }
const MODES: Array<{ id: SaleMode; label: string }> = [{ id: 'unit', label: 'Por unidad' }, { id: 'weight', label: 'Por peso' }, { id: 'amount', label: 'Por importe' }, { id: 'package', label: 'Bolsa completa' }];
const PAYMENTS: Array<{ id: PaymentMethod; label: string }> = [{ id: 'efectivo', label: 'Efectivo' }, { id: 'transferencia', label: 'Transferencia' }, { id: 'debito', label: 'Débito' }, { id: 'credito', label: 'Crédito' }, { id: 'mercado_pago', label: 'Mercado Pago' }, { id: 'otro', label: 'Otro' }];
const currency = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
function isValidModeInput(mode: SaleMode, input: string): boolean {
  if (mode === 'amount') return /^[0-9]+(?:\.[0-9]{1,2})?$/.test(input) && Number(input) > 0;
  if (mode === 'unit' || mode === 'package') return /^[0-9]+$/.test(input) && Number(input) > 0;
  return /^[0-9]+(?:\.[0-9]{1,3})?$/.test(input) && Number(input) > 0;
}
function normalizeMoney(input: string): `${number}` {
  const [whole, fraction = ''] = input.split('.');
  return `${whole}.${fraction.padEnd(2, '0')}` as `${number}`;
}
function formatStockQuantity(quantity: number, mode: SaleMode): string {
  return mode === 'unit' ? `${Math.round(quantity)} uds` : `${quantity.toFixed(3)} kg`;
}
function formatAvailableStock(quantity: number, productType: string | null | undefined): string {
  return productType === 'unit' ? `${Math.floor(quantity)} uds` : `${quantity.toFixed(3)} kg`;
}

export function PosForm({ onSaleComplete, onCancel }: { onSaleComplete?: () => void; onCancel?: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogReloadKey, setCatalogReloadKey] = useState(0);
  const [items, setItems] = useState<TicketItem[]>([]);
  const [productId, setProductId] = useState(''); const [presentationId, setPresentationId] = useState('');
  const [mode, setMode] = useState<SaleMode>('amount'); const [input, setInput] = useState('');
  const [payment, setPayment] = useState<PaymentMethod>('efectivo'); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void productService.getProducts()
      .then(data => {
        if (active) setProducts(((data ?? []) as Product[]).filter(value => value.status === 'active'));
      })
      .catch(() => {
        if (active) setCatalogError('No se pudo cargar el catálogo para la venta.');
      })
      .finally(() => {
        if (active) setCatalogLoading(false);
      });
    return () => { active = false; };
  }, [catalogReloadKey]);
  const product = products.find(value => value.id === productId); const presentations = product?.product_presentations ?? [];
  const presentation = presentations.find(value => value.id === presentationId);
  const availableStock = Number(presentation?.stock) || 0;
  const preview = (() => {
    const value = Number(input) || 0; if (!presentation || value <= 0) return { quantity: 0, subtotal: 0, cost: 0 };
    const kgPrice = Number(presentation.price_per_kg) || 0; const price = Number(presentation.price) || 0; const cost = Number(presentation.cost) || 0; const kg = Number(presentation.weight_kg) || 0;
    if (mode === 'amount') { const quantity = saleCalculations.calculateQuantityByAmount(value, kgPrice); return { quantity, subtotal: value, cost: kg ? quantity * cost / kg : 0 }; }
    if (mode === 'weight') return { quantity: value, subtotal: saleCalculations.calculateAmountByQuantity(value, kgPrice), cost: kg ? value * cost / kg : 0 };
    if (mode === 'package') return { quantity: value * kg, subtotal: saleCalculations.calculateAmountByQuantity(value, price), cost: value * cost };
    return { quantity: value, subtotal: saleCalculations.calculateAmountByQuantity(value, price), cost: value * cost };
  })();
  const exceedsStock = Boolean(presentation && preview.quantity > availableStock + 0.0001);
  const requestedStockLabel = formatAvailableStock(preview.quantity, product?.type);
  const availableStockLabel = formatAvailableStock(availableStock, product?.type);
  const retryCatalog = () => {
    setCatalogLoading(true);
    setCatalogError(null);
    setCatalogReloadKey(current => current + 1);
  };
  const addItem = () => {
    setError(null);
    if (!isValidModeInput(mode, input)) { setError(mode === 'weight' ? 'El peso admite hasta 3 decimales.' : mode === 'amount' ? 'Ingresá un importe positivo.' : 'La cantidad debe ser un número entero positivo.'); return; }
    if (!product || !presentation || preview.quantity <= 0 || preview.subtotal <= 0) return;
    if (exceedsStock) { setError(`Stock insuficiente. Solicitaste ${requestedStockLabel} y hay ${availableStockLabel} disponibles.`); return; }
    if (items.some(item => item.presentationId === presentation.id)) { setError('Esa presentación ya está en el ticket. Quitala para cambiar su modalidad o cantidad.'); return; }
    setItems(current => [...current, { presentationId: presentation.id, productName: product.name, presentationName: presentation.name, mode, input, ...preview }]);
    setProductId(''); setPresentationId(''); setInput('');
  };
  const totals = items.reduce((sum, item) => ({ amount: sum.amount + item.subtotal, cost: sum.cost + item.cost }), { amount: 0, cost: 0 });
  const processSale = async () => {
    setLoading(true); setError(null);
    try { const payload: SaleItemPayload[] = items.map(item => {
      const numericInput = Number(item.input);
      if (!isValidModeInput(item.mode, item.input) || !Number.isFinite(numericInput)) throw new Error('El ticket contiene una cantidad con formato inválido.');
      return item.mode === 'amount'
        ? { presentation_id: item.presentationId, mode: 'amount', amount: normalizeMoney(item.input) }
        : { presentation_id: item.presentationId, mode: item.mode, quantity: item.input as `${number}` };
    });
      const result = await saleService.processSale(payment, payload);
      const stockAfter = new Map(result.items.map(item => [item.presentation_id, Number(item.stock_after)]));
      setProducts(current => current.map(currentProduct => ({
        ...currentProduct,
        product_presentations: currentProduct.product_presentations.map(currentPresentation => {
          const updatedStock = stockAfter.get(currentPresentation.id);
          return updatedStock === undefined ? currentPresentation : { ...currentPresentation, stock: updatedStock };
        }),
      })));
      setItems([]);
      onSaleComplete?.();
      await Swal.fire({
        icon: 'success',
        title: 'Venta cobrada',
        text: `${currency.format(Number(result.total_amount))} · ${PAYMENTS.find(option => option.id === payment)?.label ?? 'Pago registrado'}`,
        confirmButtonText: 'Nueva venta',
        confirmButtonColor: '#059669',
      });
    }
    catch (caught: unknown) { setError(caught instanceof Error ? caught.message : 'No se pudo procesar la venta.'); } finally { setLoading(false); }
  };
  const inputLabel = mode === 'amount' ? 'Importe a cobrar' : mode === 'package' ? 'Cantidad de bolsas' : mode === 'unit' ? 'Cantidad de unidades' : 'Cantidad a entregar (kg)';
  const inputPlaceholder = mode === 'amount' ? 'Ej.: $ 3.000' : mode === 'package' ? 'Ej.: 1 bolsa' : mode === 'unit' ? 'Ej.: 1 unidad' : 'Ej.: 2,500 kg';
  return (
    <div className="flex min-h-full w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:h-full">
      <header className="flex items-center gap-3 border-b border-slate-100 p-4 sm:p-6">
        {onCancel && <button type="button" onClick={onCancel} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Volver"><ArrowLeft className="h-5 w-5" /></button>}
        <div>
          <h2 className="text-xl font-bold text-slate-800">Punto de venta</h2>
          <p className="text-xs text-slate-500">El servidor calcula precios, costos y stock definitivo</p>
        </div>
      </header>

      {error && <div className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6" role="alert">{error}</div>}
      {catalogError && (
        <div className="mx-4 mt-4 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <span>{catalogError}</span>
          <button type="button" onClick={retryCatalog} className="inline-flex items-center gap-1.5 font-semibold hover:underline">
            <RefreshCw className="h-4 w-4" />Reintentar
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:min-h-0 lg:flex-1 lg:grid-cols-12">
        <section className="flex flex-col gap-5 p-4 sm:p-6 lg:col-span-7" data-testid="pos-entry-panel">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 sm:grid-cols-4">
            {MODES.map(option => {
              const incompatible = product ? (product.type === 'weight' ? option.id === 'unit' : option.id !== 'unit') : false;
              return (
                <button key={option.id} type="button" aria-pressed={mode === option.id} disabled={incompatible} onClick={() => { setMode(option.id); setInput(''); setError(null); }} className={`rounded-md px-2 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:text-slate-300 ${mode === option.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Producto
              <select value={productId} onChange={e => { const next = products.find(value => value.id === e.target.value); setProductId(e.target.value); setPresentationId(''); setMode(next?.type === 'weight' ? 'amount' : 'unit'); setInput(''); setError(null); }} disabled={catalogLoading || Boolean(catalogError)} aria-busy={catalogLoading} className="mt-1.5 w-full rounded-lg border border-slate-200 p-2.5 disabled:cursor-not-allowed disabled:bg-slate-50">
                <option value="">{catalogLoading ? 'Cargando productos…' : catalogError ? 'Catálogo no disponible' : products.length === 0 ? 'No hay productos activos' : 'Seleccionar…'}</option>{products.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">Presentación
              <select value={presentationId} onChange={e => { setPresentationId(e.target.value); setInput(''); setError(null); }} disabled={!productId} className="mt-1.5 w-full rounded-lg border border-slate-200 p-2.5 disabled:bg-slate-50">
                <option value="">Seleccionar…</option>{presentations.map(value => <option key={value.id} value={value.id}>{value.name} — {formatAvailableStock(Number(value.stock) || 0, product?.type)}</option>)}
              </select>
            </label>
          </div>

          {presentation && (
            <div
              className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-sm ${availableStock > 0 ? 'border-blue-100 bg-blue-50/70 text-blue-800' : 'border-red-200 bg-red-50 text-red-700'}`}
              data-testid="pos-available-stock"
              role="status"
            >
              <span className="flex items-center gap-2"><Boxes className="h-4 w-4" />Stock disponible</span>
              <strong>{availableStockLabel}</strong>
            </div>
          )}

          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5">
            <label className="text-sm font-medium text-blue-900">{inputLabel}
              <input type="number" min="0" step={mode === 'amount' ? '0.01' : mode === 'weight' ? '0.001' : '1'} value={input} placeholder={availableStock > 0 ? inputPlaceholder : 'Sin stock disponible'} onChange={e => { setInput(e.target.value); setError(null); }} disabled={Boolean(presentation && availableStock <= 0)} aria-invalid={exceedsStock} aria-describedby={exceedsStock ? 'pos-stock-error' : undefined} className={`mt-2 w-full rounded-lg border bg-white p-4 text-2xl font-bold text-blue-950 outline-none placeholder:text-base placeholder:font-normal placeholder:text-slate-400 focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100 ${exceedsStock ? 'border-red-400 focus:ring-red-500' : 'border-blue-200 focus:ring-blue-500'}`} data-testid="pos-input-value" />
            </label>
            {presentation && input && (
              exceedsStock ? (
                <div id="pos-stock-error" className="mt-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" data-testid="pos-stock-error" role="alert">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div><strong className="block">Stock insuficiente</strong><span>Solicitado: {requestedStockLabel} · Disponible: {availableStockLabel}</span></div>
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-blue-100 bg-white p-4 text-sm sm:grid-cols-2" data-testid="pos-calculation-result">
                  <div><span className="text-slate-500">Stock a descontar</span><strong className="block text-lg text-blue-700">{formatStockQuantity(preview.quantity, mode)}</strong></div>
                  <div><span className="text-slate-500">Importe estimado</span><strong className="block text-lg text-emerald-700">${preview.subtotal.toFixed(2)}</strong></div>
                  <div className="flex items-center gap-2 border-t border-slate-100 pt-3 text-slate-600 sm:col-span-2"><Calculator className="h-4 w-4" />Costo estimado: ${preview.cost.toFixed(2)}</div>
                </div>
              )
            )}
          </div>

          <button type="button" onClick={addItem} disabled={!presentation || !input || preview.subtotal <= 0 || exceedsStock || availableStock <= 0} className="flex items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-5 w-5" />Agregar al ticket</button>
        </section>

        <section className="flex flex-col border-t border-slate-200 bg-slate-50 p-4 sm:p-6 lg:col-span-5 lg:min-h-0 lg:border-l lg:border-t-0" data-testid="pos-ticket-panel">
          <h3 className="mb-4 text-lg font-bold text-slate-800">Ticket de venta</h3>
          <div className="mb-5 min-h-36 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            {items.length === 0 ? (
              <div className="grid min-h-36 place-items-center text-slate-400 lg:h-full">
                <div className="text-center"><ShoppingCart className="mx-auto mb-2 h-10 w-10" /><p>El ticket está vacío</p></div>
              </div>
            ) : (
              <div className="space-y-3">{items.map(item => (
                <div key={item.presentationId} className="flex justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="min-w-0"><strong className="block truncate text-sm text-slate-800">{item.productName}</strong><p className="text-xs text-slate-500">{item.presentationName} · {MODES.find(value => value.id === item.mode)?.label}</p><p className="text-xs font-medium text-blue-600">{formatStockQuantity(item.quantity, item.mode)}</p></div>
                  <div className="shrink-0 text-right"><strong>${item.subtotal.toFixed(2)}</strong><button type="button" onClick={() => setItems(current => current.filter(value => value.presentationId !== item.presentationId))} className="mt-2 ml-auto block text-slate-400 hover:text-red-500" aria-label={`Quitar ${item.productName}`}><Trash2 className="h-4 w-4" /></button></div>
                </div>
              ))}</div>
            )}
          </div>

          <label className="mb-4 text-sm font-medium text-slate-700">Medio de pago
            <select value={payment} onChange={e => setPayment(e.target.value as PaymentMethod)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-2.5">{PAYMENTS.map(value => <option key={value.id} value={value.id}>{value.label}</option>)}</select>
          </label>
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex justify-between text-sm text-slate-500"><span>Costo estimado</span><span>${totals.cost.toFixed(2)}</span></div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3"><span className="text-base text-slate-800 sm:text-lg">Total estimado</span><strong className="text-2xl text-emerald-600 sm:text-3xl">${totals.amount.toFixed(2)}</strong></div>
          </div>
          <button type="button" onClick={() => void processSale()} disabled={!items.length || loading} className="mt-4 rounded-xl bg-[#10B981] px-4 py-4 text-lg font-bold text-white hover:bg-[#059669] disabled:opacity-50">{loading ? 'Procesando…' : 'Cobrar ticket'}</button>
        </section>
      </div>
    </div>
  );
}
