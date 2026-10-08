import React, { useEffect, useState, useCallback } from 'react';
import { inventoryService } from '../services/inventoryService';
import { productService } from '../services/productService';
import type { Database } from '../types/database.types';
import {
  AlertTriangle, ArrowDownCircle, ArrowUpCircle, BarChart2,
  CheckCircle, ChevronDown, ChevronUp, ClipboardList, RefreshCw, X,
} from 'lucide-react';

type MovementRow = Database['public']['Tables']['inventory_movements']['Row'];

interface Presentation {
  id: string;
  name: string;
  stock: number;
  weight_kg: number | null;
  product_id: string | null;
}

interface Product {
  id: string;
  name: string;
  type: string | null;
  product_presentations: Presentation[];
}

// ── helpers ────────────────────────────────────────────────────────────────

const MOVEMENT_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  compra:  { label: 'Compra',  color: 'text-blue-600 bg-blue-50',   icon: <ArrowUpCircle   className="w-3.5 h-3.5" /> },
  venta:   { label: 'Venta',   color: 'text-green-600 bg-green-50',  icon: <ArrowDownCircle className="w-3.5 h-3.5" /> },
  merma:   { label: 'Merma',   color: 'text-red-600 bg-red-50',      icon: <AlertTriangle   className="w-3.5 h-3.5" /> },
  ajuste:  { label: 'Ajuste',  color: 'text-amber-600 bg-amber-50',  icon: <BarChart2       className="w-3.5 h-3.5" /> },
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatQty(qty: number): string {
  const sign = qty > 0 ? '+' : '';
  return `${sign}${Number(qty).toLocaleString('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
}

// ── Formulario de Merma ────────────────────────────────────────────────────

interface ShrinkageFormProps {
  products: Product[];
  onSuccess: () => void;
}

type ShrinkageFormState = {
  productId: string;
  presentationId: string;
  quantity: string;
  reason: string;
};

const SHRINKAGE_REASONS = [
  'Alimento vencido',
  'Derrame / rotura de envase',
  'Daño por humedad',
  'Contaminación',
  'Robo / faltante',
  'Otro',
];

function ShrinkageForm({ products, onSuccess }: ShrinkageFormProps) {
  const [form, setForm] = useState<ShrinkageFormState>({
    productId: '', presentationId: '', quantity: '', reason: '',
  });
  const [customReason, setCustomReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProduct = products.find(p => p.id === form.productId);
  const selectedPres = selectedProduct?.product_presentations.find(p => p.id === form.presentationId);
  const isWeightProduct = selectedProduct?.type === 'weight';
  const effectiveReason = form.reason === 'Otro' ? customReason : form.reason;

  const set = (key: keyof ShrinkageFormState, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.productId || !form.presentationId) { setError('Seleccioná un producto y presentación.'); return; }
    if (!form.quantity || Number(form.quantity) <= 0) { setError('La cantidad debe ser mayor a cero.'); return; }
    if (!effectiveReason.trim()) { setError('El motivo es obligatorio para registrar una merma.'); return; }
    if (!selectedPres) return;

    setSaving(true);
    try {
      await inventoryService.recordShrinkage({
        presentationId: form.presentationId,
        productId: form.productId,
        quantity: Number(form.quantity),
        reason: effectiveReason,
        currentStock: Number(selectedPres.stock),
      });
      setForm({ productId: '', presentationId: '', quantity: '', reason: '' });
      setCustomReason('');
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="shrinkage-form">
      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm" data-testid="shrinkage-error">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Producto */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Producto</label>
          <select
            value={form.productId}
            onChange={e => { set('productId', e.target.value); set('presentationId', ''); }}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-red-400 outline-none bg-white"
            data-testid="shrinkage-product-select"
          >
            <option value="">Seleccionar producto…</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Presentación */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Presentación</label>
          <select
            value={form.presentationId}
            onChange={e => set('presentationId', e.target.value)}
            disabled={!form.productId}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-red-400 outline-none bg-white disabled:bg-slate-50 disabled:text-slate-400"
            data-testid="shrinkage-presentation-select"
          >
            <option value="">Seleccionar presentación…</option>
            {selectedProduct?.product_presentations.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} (stock: {Number(p.stock).toLocaleString('es-AR')} {isWeightProduct ? 'kg' : 'uds'})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Cantidad */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Cantidad a dar de baja {isWeightProduct ? '(kg)' : '(uds)'}
        </label>
        <input
          type="number"
          step={isWeightProduct ? '0.001' : '1'}
          min="0.001"
          max={selectedPres ? Number(selectedPres.stock) : undefined}
          value={form.quantity}
          onChange={e => set('quantity', e.target.value)}
          placeholder={isWeightProduct ? '0.000' : '0'}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-red-400 outline-none"
          data-testid="shrinkage-quantity-input"
        />
        {selectedPres && (
          <p className="text-xs text-slate-400 mt-1">
            Stock actual: {Number(selectedPres.stock).toLocaleString('es-AR')} {isWeightProduct ? 'kg' : 'uds'}
          </p>
        )}
      </div>

      {/* Motivo (obligatorio) */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Motivo <span className="text-red-500 font-bold">*</span>
        </label>
        <div className="grid grid-cols-2 gap-2 mb-2">
          {SHRINKAGE_REASONS.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => set('reason', r)}
              className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                form.reason === r
                  ? 'border-red-400 bg-red-50 text-red-700 font-medium'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
              data-testid={`reason-btn-${r.replace(/\s/g, '-')}`}
            >
              {r}
            </button>
          ))}
        </div>
        {form.reason === 'Otro' && (
          <input
            type="text"
            value={customReason}
            onChange={e => setCustomReason(e.target.value)}
            placeholder="Describí el motivo…"
            className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:ring-2 focus:ring-red-400 outline-none"
            data-testid="shrinkage-custom-reason"
          />
        )}
        {!form.reason && (
          <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Seleccioná o escribí el motivo de la merma.
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={saving}
        className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        data-testid="shrinkage-submit"
      >
        {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
        {saving ? 'Registrando…' : 'Registrar merma'}
      </button>
    </form>
  );
}

// ── Formulario de Ajuste ───────────────────────────────────────────────────

interface AdjustmentFormProps {
  products: Product[];
  onSuccess: () => void;
}

function AdjustmentForm({ products, onSuccess }: AdjustmentFormProps) {
  const [productId, setProductId] = useState('');
  const [presentationId, setPresentationId] = useState('');
  const [physicalStock, setPhysicalStock] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProduct = products.find(p => p.id === productId);
  const selectedPres = selectedProduct?.product_presentations.find(p => p.id === presentationId);
  const isWeightProduct = selectedProduct?.type === 'weight';
  const systemStock = selectedPres ? Number(selectedPres.stock) : null;
  const physNum = physicalStock !== '' ? Number(physicalStock) : null;
  const delta = systemStock != null && physNum != null ? physNum - systemStock : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!productId || !presentationId) { setError('Seleccioná producto y presentación.'); return; }
    if (physNum == null || physNum < 0) { setError('Ingresá el stock físico contado.'); return; }
    if (systemStock == null) return;

    setSaving(true);
    try {
      await inventoryService.recordAdjustment({
        presentationId,
        productId,
        physicalStock: physNum,
        systemStock,
        reason: reason.trim() || undefined,
      });
      setProductId(''); setPresentationId(''); setPhysicalStock(''); setReason('');
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="adjustment-form">
      {error && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Producto</label>
          <select
            value={productId}
            onChange={e => { setProductId(e.target.value); setPresentationId(''); }}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 outline-none bg-white"
            data-testid="adjustment-product-select"
          >
            <option value="">Seleccionar producto…</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Presentación</label>
          <select
            value={presentationId}
            onChange={e => setPresentationId(e.target.value)}
            disabled={!productId}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 outline-none bg-white disabled:bg-slate-50 disabled:text-slate-400"
            data-testid="adjustment-presentation-select"
          >
            <option value="">Seleccionar presentación…</option>
            {selectedProduct?.product_presentations.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Comparativa Stock Físico vs Sistema */}
      {selectedPres && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-200">
            <div className="text-xs text-slate-400 mb-1">Stock en sistema</div>
            <div className="text-lg font-bold text-slate-700">
              {systemStock?.toLocaleString('es-AR')}
              <span className="text-xs font-normal text-slate-400 ml-1">{isWeightProduct ? 'kg' : 'uds'}</span>
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 text-center border-2 border-amber-300">
            <div className="text-xs text-amber-600 font-medium mb-1">Stock físico contado</div>
            <input
              type="number"
              step={isWeightProduct ? '0.001' : '1'}
              min="0"
              value={physicalStock}
              onChange={e => setPhysicalStock(e.target.value)}
              placeholder={isWeightProduct ? '0.000' : '0'}
              className="w-full text-center text-lg font-bold text-slate-800 outline-none bg-transparent"
              data-testid="adjustment-physical-input"
            />
          </div>
          <div className={`rounded-lg p-3 text-center border ${
            delta == null ? 'bg-slate-50 border-slate-200'
            : delta > 0 ? 'bg-blue-50 border-blue-200'
            : delta < 0 ? 'bg-red-50 border-red-200'
            : 'bg-green-50 border-green-200'
          }`}>
            <div className="text-xs text-slate-400 mb-1">Diferencia</div>
            <div className={`text-lg font-bold ${
              delta == null ? 'text-slate-400'
              : delta > 0 ? 'text-blue-600'
              : delta < 0 ? 'text-red-600'
              : 'text-green-600'
            }`}>
              {delta == null ? '—' : formatQty(delta)}
              {delta != null && <span className="text-xs font-normal ml-1">{isWeightProduct ? 'kg' : 'uds'}</span>}
            </div>
            {delta === 0 && <div className="text-xs text-green-600 mt-0.5 flex items-center justify-center gap-1"><CheckCircle className="w-3 h-3" /> Sin diferencia</div>}
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
          Observación <span className="text-slate-400 font-normal">(opcional)</span>
        </label>
        <input
          type="text"
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Ej: Conteo tras cierre de jornada"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 outline-none"
          data-testid="adjustment-reason-input"
        />
      </div>

      <button
        type="submit"
        disabled={saving || delta === 0 || delta == null}
        className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        data-testid="adjustment-submit"
      >
        {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BarChart2 className="w-4 h-4" />}
        {saving ? 'Guardando…' : 'Guardar ajuste'}
      </button>
    </form>
  );
}

// ── Tabla de Kardex / Movimientos ─────────────────────────────────────────

interface MovementsTableProps {
  movements: MovementRow[];
  loading: boolean;
}

function MovementsTable({ movements, loading }: MovementsTableProps) {
  if (loading) {
    return <div className="p-12 text-center text-slate-400">Cargando movimientos…</div>;
  }
  if (movements.length === 0) {
    return (
      <div className="p-12 text-center text-slate-400">
        <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Sin movimientos registrados todavía.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wide">
            <th className="py-3 px-4">Fecha</th>
            <th className="py-3 px-4">Tipo</th>
            <th className="py-3 px-4">Presentación</th>
            <th className="py-3 px-4 text-right">Cantidad</th>
            <th className="py-3 px-4">Motivo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {movements.map(mov => {
            const meta = MOVEMENT_LABELS[mov.type] ?? { label: mov.type, color: 'text-slate-600 bg-slate-50', icon: null };
            const qty = Number(mov.quantity);
            return (
              <tr key={mov.id} className="hover:bg-slate-50 transition-colors">
                <td className="py-3 px-4 text-slate-500 whitespace-nowrap">{formatDate(mov.created_at)}</td>
                <td className="py-3 px-4">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${meta.color}`}>
                    {meta.icon}
                    {meta.label}
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-700 text-xs">{mov.presentation_id?.slice(0, 8) ?? '—'}</td>
                <td className={`py-3 px-4 text-right font-mono font-semibold ${qty < 0 ? 'text-red-600' : 'text-blue-600'}`}>
                  {formatQty(qty)}
                </td>
                <td className="py-3 px-4 text-slate-500 text-xs max-w-xs truncate">{mov.reason ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Vista Principal ────────────────────────────────────────────────────────

type Tab = 'mermas' | 'ajustes' | 'kardex';

interface InventoryViewProps {
  products: Product[];
}

export function InventoryView({ products }: InventoryViewProps) {
  const [tab, setTab] = useState<Tab>('mermas');
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loadingMov, setLoadingMov] = useState(true);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadMovements = useCallback(async () => {
    setLoadingMov(true);
    try {
      const raw = await inventoryService.getMovements();
      setMovements((raw ?? []) as MovementRow[]);
    } catch {
      setMovements([]);
    } finally {
      setLoadingMov(false);
    }
  }, []);

  useEffect(() => { void loadMovements(); }, [loadMovements]);

  const handleSuccess = (msg: string) => {
    setSuccessMsg(msg);
    void loadMovements();
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'mermas',  label: 'Registrar Merma',  icon: <AlertTriangle className="w-4 h-4" /> },
    { id: 'ajustes', label: 'Ajuste de Stock',  icon: <BarChart2     className="w-4 h-4" /> },
    { id: 'kardex',  label: 'Kardex / Historial', icon: <ClipboardList className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col h-full gap-6">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Inventario</h2>
          <p className="text-sm text-slate-500 mt-0.5">Control de mermas, ajustes y Kardex</p>
        </div>
        <button
          onClick={() => void loadMovements()}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Actualizar
        </button>
      </header>

      {/* Success banner */}
      {successMsg && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm" data-testid="inventory-success">
          <CheckCircle className="w-4 h-4 shrink-0" />
          {successMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            data-testid={`tab-${t.id}`}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Panel activo */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col">
        {tab === 'mermas' && (
          <div className="p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="p-2 bg-red-50 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Registrar Merma</h3>
                <p className="text-xs text-slate-500">El motivo es obligatorio. El stock se descuenta automáticamente.</p>
              </div>
            </div>
            <ShrinkageForm
              products={products}
              onSuccess={() => handleSuccess('Merma registrada correctamente.')}
            />
          </div>
        )}

        {tab === 'ajustes' && (
          <div className="p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="p-2 bg-amber-50 rounded-lg">
                <BarChart2 className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Ajuste de Stock</h3>
                <p className="text-xs text-slate-500">Corregí discrepancias entre el stock físico y el sistema.</p>
              </div>
            </div>
            <AdjustmentForm
              products={products}
              onSuccess={() => handleSuccess('Ajuste registrado correctamente.')}
            />
          </div>
        )}

        {tab === 'kardex' && (
          <div className="flex flex-col flex-1">
            <div className="px-6 pt-5 pb-3 border-b border-slate-100 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-slate-400" />
              <h3 className="font-semibold text-slate-800">Kardex — Historial de movimientos</h3>
              <span className="ml-auto text-xs text-slate-400">{movements.length} registros</span>
            </div>
            <MovementsTable movements={movements} loading={loadingMov} />
          </div>
        )}
      </div>
    </div>
  );
}
