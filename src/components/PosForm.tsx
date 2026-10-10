import { useEffect, useState } from 'react';
import { ArrowLeft, Calculator, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { productService } from '../services/productService';
import { saleCalculations, saleService, type SaleItemPayload, type SaleMode } from '../services/saleService';
import type { Database } from '../types/database.types';

type Product = Database['public']['Tables']['products']['Row'] & { product_presentations: Database['public']['Tables']['product_presentations']['Row'][] };
type PaymentMethod = 'efectivo' | 'transferencia' | 'debito' | 'credito' | 'mercado_pago' | 'otro';
interface TicketItem { presentationId: string; productName: string; presentationName: string; mode: SaleMode; input: string; quantity: number; subtotal: number; cost: number; }
const MODES: Array<{ id: SaleMode; label: string }> = [{ id: 'unit', label: 'Por unidad' }, { id: 'weight', label: 'Por peso' }, { id: 'amount', label: 'Por importe' }, { id: 'package', label: 'Bolsa completa' }];
const PAYMENTS: Array<{ id: PaymentMethod; label: string }> = [{ id: 'efectivo', label: 'Efectivo' }, { id: 'transferencia', label: 'Transferencia' }, { id: 'debito', label: 'Débito' }, { id: 'credito', label: 'Crédito' }, { id: 'mercado_pago', label: 'Mercado Pago' }, { id: 'otro', label: 'Otro' }];
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
  return mode === 'unit' ? `${Math.round(quantity)} u` : `${quantity.toFixed(3)} kg`;
}

export function PosForm({ onSaleComplete, onCancel }: { onSaleComplete?: () => void; onCancel?: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<TicketItem[]>([]);
  const [productId, setProductId] = useState(''); const [presentationId, setPresentationId] = useState('');
  const [mode, setMode] = useState<SaleMode>('amount'); const [input, setInput] = useState('');
  const [payment, setPayment] = useState<PaymentMethod>('efectivo'); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => { void productService.getProducts().then(data => setProducts(((data ?? []) as Product[]).filter(value => value.status === 'active'))); }, []);
  const product = products.find(value => value.id === productId); const presentations = product?.product_presentations ?? [];
  const presentation = presentations.find(value => value.id === presentationId);
  const preview = (() => {
    const value = Number(input) || 0; if (!presentation || value <= 0) return { quantity: 0, subtotal: 0, cost: 0 };
    const kgPrice = Number(presentation.price_per_kg) || 0; const price = Number(presentation.price) || 0; const cost = Number(presentation.cost) || 0; const kg = Number(presentation.weight_kg) || 0;
    if (mode === 'amount') { const quantity = saleCalculations.calculateQuantityByAmount(value, kgPrice); return { quantity, subtotal: value, cost: kg ? quantity * cost / kg : 0 }; }
    if (mode === 'weight') return { quantity: value, subtotal: saleCalculations.calculateAmountByQuantity(value, kgPrice), cost: kg ? value * cost / kg : 0 };
    if (mode === 'package') return { quantity: value * kg, subtotal: saleCalculations.calculateAmountByQuantity(value, price), cost: value * cost };
    return { quantity: value, subtotal: saleCalculations.calculateAmountByQuantity(value, price), cost: value * cost };
  })();
  const addItem = () => {
    setError(null);
    if (!isValidModeInput(mode, input)) { setError(mode === 'weight' ? 'El peso admite hasta 3 decimales.' : mode === 'amount' ? 'Ingresá un importe positivo.' : 'La cantidad debe ser un número entero positivo.'); return; }
    if (!product || !presentation || preview.quantity <= 0 || preview.subtotal <= 0) return;
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
    }); await saleService.processSale(payment, payload); setItems([]); onSaleComplete?.(); }
    catch (caught: unknown) { setError(caught instanceof Error ? caught.message : 'No se pudo procesar la venta.'); } finally { setLoading(false); }
  };
  const inputLabel = mode === 'amount' ? 'Importe a cobrar' : mode === 'package' ? 'Cantidad de bolsas' : mode === 'unit' ? 'Cantidad de unidades' : 'Cantidad a entregar (kg)';
  const inputPlaceholder = mode === 'amount' ? 'Ej.: $ 3.000' : mode === 'package' ? 'Ej.: 1 bolsa' : mode === 'unit' ? 'Ej.: 1 unidad' : 'Ej.: 2,500 kg';
  return (
    <div className="flex min-h-full w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:h-full">
      <header className="flex items-center gap-3 border-b border-slate-100 p-4 sm:p-6">
        {onCancel && <button onClick={onCancel} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></button>}
        <div>
          <h2 className="text-xl font-bold text-slate-800">Punto de venta</h2>
          <p className="text-xs text-slate-500">El servidor calcula precios, costos y stock definitivo</p>
        </div>
      </header>

      {error && <div className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6" role="alert">{error}</div>}

      <div className="grid grid-cols-1 lg:min-h-0 lg:flex-1 lg:grid-cols-12">
        <section className="flex flex-col gap-5 p-4 sm:p-6 lg:col-span-7" data-testid="pos-entry-panel">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 sm:grid-cols-4">
            {MODES.map(option => {
              const incompatible = product ? (product.type === 'weight' ? option.id === 'unit' : option.id !== 'unit') : false;
              return (
                <button key={option.id} type="button" disabled={incompatible} onClick={() => { setMode(option.id); setInput(''); }} className={`rounded-md px-2 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:text-slate-300 ${mode === option.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Producto
              <select value={productId} onChange={e => { const next = products.find(value => value.id === e.target.value); setProductId(e.target.value); setPresentationId(''); setMode(next?.type === 'weight' ? 'amount' : 'unit'); setInput(''); }} className="mt-1.5 w-full rounded-lg border border-slate-200 p-2.5">
                <option value="">Seleccionar…</option>{products.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">Presentación
              <select value={presentationId} onChange={e => setPresentationId(e.target.value)} disabled={!productId} className="mt-1.5 w-full rounded-lg border border-slate-200 p-2.5 disabled:bg-slate-50">
                <option value="">Seleccionar…</option>{presentations.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}
              </select>
            </label>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5">
            <label className="text-sm font-medium text-blue-900">{inputLabel}
              <input type="number" min="0" step={mode === 'amount' ? '0.01' : mode === 'weight' ? '0.001' : '1'} value={input} placeholder={inputPlaceholder} onChange={e => setInput(e.target.value)} className="mt-2 w-full rounded-lg border border-blue-200 bg-white p-4 text-2xl font-bold text-blue-950 outline-none placeholder:text-base placeholder:font-normal placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500" data-testid="pos-input-value" />
            </label>
            {presentation && input && (
              <div className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-blue-100 bg-white p-4 text-sm sm:grid-cols-2" data-testid="pos-calculation-result">
                <div><span className="text-slate-500">Stock a descontar</span><strong className="block text-lg text-blue-700">{formatStockQuantity(preview.quantity, mode)}</strong></div>
                <div><span className="text-slate-500">Importe estimado</span><strong className="block text-lg text-emerald-700">${preview.subtotal.toFixed(2)}</strong></div>
                <div className="flex items-center gap-2 border-t border-slate-100 pt-3 text-slate-600 sm:col-span-2"><Calculator className="h-4 w-4" />Costo estimado: ${preview.cost.toFixed(2)}</div>
              </div>
            )}
          </div>

          <button type="button" onClick={addItem} disabled={!presentation || !input || preview.subtotal <= 0} className="flex items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 py-3 font-medium text-white disabled:opacity-50"><Plus className="h-5 w-5" />Agregar al ticket</button>
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
                  <div className="shrink-0 text-right"><strong>${item.subtotal.toFixed(2)}</strong><button onClick={() => setItems(current => current.filter(value => value.presentationId !== item.presentationId))} className="mt-2 ml-auto block text-slate-400 hover:text-red-500" aria-label={`Quitar ${item.productName}`}><Trash2 className="h-4 w-4" /></button></div>
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
          <button onClick={() => void processSale()} disabled={!items.length || loading} className="mt-4 rounded-xl bg-[#10B981] px-4 py-4 text-lg font-bold text-white hover:bg-[#059669] disabled:opacity-50">{loading ? 'Procesando…' : 'Cobrar ticket'}</button>
        </section>
      </div>
    </div>
  );
}
