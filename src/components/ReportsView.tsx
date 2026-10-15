import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, ChevronLeft, ChevronRight, FileDown, LoaderCircle, RefreshCw, Search } from 'lucide-react';
import { formatTimestamp, getRecentRange } from '../lib/reportDates';
import { formatMoney, formatMovementReason, movementLabels, paymentLabels } from '../lib/reportFormatting';
import { downloadReportWorkbook } from '../services/reportExportService';
import {
  reportService,
  type InventoryMovementReport,
  type MovementType,
  type PaymentMethodSummary,
  type ProductProfitability,
  type ReportDateRange,
} from '../services/reportService';

interface ReportsViewProps {
  products: Array<{ id: string; name: string }>;
}

type ReportTab = 'profitability' | 'payments' | 'movements';

function messageFor(error: unknown): string {
  if (error instanceof Error && error.message === 'INVALID_DATE_RANGE') return 'La fecha desde debe ser anterior o igual a la fecha hasta.';
  if (error instanceof Error && error.message === 'DATE_RANGE_TOO_LARGE') return 'El período máximo es de 366 días.';
  return 'No pudimos cargar este reporte. Revisá la conexión y volvé a intentar.';
}

function ReportLoading() {
  return <div className="space-y-2 p-5" aria-label="Cargando reporte">{[1, 2, 3, 4, 5].map(row => <div key={row} className="h-14 animate-pulse rounded-lg bg-slate-100" />)}</div>;
}

function EmptyReport({ children }: { children: string }) {
  return <div className="grid min-h-56 place-items-center p-8 text-center"><div><BarChart3 className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">Sin resultados</p><p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{children}</p></div></div>;
}

function ProfitabilityReport({ rows }: { rows: ProductProfitability[] }) {
  if (rows.length === 0) return <EmptyReport>No hay ventas confirmadas dentro del período seleccionado.</EmptyReport>;
  return (
    <div>
      <div className="divide-y divide-slate-100 md:hidden">
        {rows.map(row => <article key={row.product_id} className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-800">{row.product_name}</p><p className="text-xs text-slate-500">{Number(row.stock_quantity).toLocaleString('es-AR')} {row.unit} vendidos</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${Number(row.gross_profit) >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{row.margin_pct === null ? '—' : `${Number(row.margin_pct).toLocaleString('es-AR')}%`}</span></div><dl className="grid grid-cols-3 gap-2 text-xs"><div><dt className="text-slate-400">Ventas</dt><dd className="mt-1 font-semibold text-slate-700">{formatMoney(row.total_amount)}</dd></div><div><dt className="text-slate-400">Costo histórico</dt><dd className="mt-1 font-semibold text-slate-700">{formatMoney(row.total_cost)}</dd></div><div><dt className="text-slate-400">Ganancia bruta estimada</dt><dd className="mt-1 font-semibold text-emerald-700">{formatMoney(row.gross_profit)}</dd></div></dl></article>)}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500"><tr><th className="px-5 py-3">Producto</th><th className="px-4 py-3 text-right">Cantidad</th><th className="px-4 py-3 text-right">Ventas</th><th className="px-4 py-3 text-right">Costo histórico</th><th className="px-4 py-3 text-right">Ganancia bruta estimada</th><th className="px-5 py-3 text-right">Margen</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map(row => <tr key={row.product_id}><td className="px-5 py-3.5 font-semibold text-slate-800">{row.product_name}<span className="ml-2 text-xs font-normal text-slate-400">{row.sales_count} ventas</span></td><td className="px-4 py-3.5 text-right text-slate-600">{Number(row.stock_quantity).toLocaleString('es-AR')} {row.unit}</td><td className="px-4 py-3.5 text-right font-medium text-slate-700">{formatMoney(row.total_amount)}</td><td className="px-4 py-3.5 text-right text-slate-600">{formatMoney(row.total_cost)}</td><td className={`px-4 py-3.5 text-right font-bold ${Number(row.gross_profit) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatMoney(row.gross_profit)}</td><td className="px-5 py-3.5 text-right"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${Number(row.gross_profit) >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{row.margin_pct === null ? '—' : `${Number(row.margin_pct).toLocaleString('es-AR')}%`}</span></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentReport({ rows }: { rows: PaymentMethodSummary[] }) {
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(row => <article key={row.payment_method} className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-slate-700">{paymentLabels[row.payment_method]}</p><span className="text-xs text-slate-400">{row.sales_count} ventas</span></div><p className="mt-3 text-xl font-bold text-slate-900">{formatMoney(row.total_amount)}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(Math.max(Number(row.share_pct), 0), 100)}%` }} /></div><p className="mt-2 text-xs font-medium text-blue-700">{Number(row.share_pct).toLocaleString('es-AR')}% del total</p></article>)}
    </div>
  );
}

function MovementReport({ report }: { report: InventoryMovementReport }) {
  if (report.items.length === 0) return <EmptyReport>No hay movimientos que coincidan con los filtros aplicados.</EmptyReport>;
  return (
    <div>
      <div className="divide-y divide-slate-100 md:hidden">{report.items.map(item => <article key={item.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><span className={`rounded-full px-2 py-1 text-xs font-bold ${item.type === 'merma' ? 'bg-red-50 text-red-700' : item.type === 'compra' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>{movementLabels[item.type]}</span><p className="mt-2 font-semibold text-slate-800">{item.product_name ?? 'Producto eliminado'}</p><p className="text-xs text-slate-500">{item.presentation_name ?? 'Sin presentación'}</p></div><div className="text-right"><p className={`font-bold ${Number(item.quantity) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{Number(item.quantity) > 0 ? '+' : ''}{Number(item.quantity).toLocaleString('es-AR')} {item.unit}</p><p className="mt-1 text-xs text-slate-400">{formatTimestamp(item.created_at)}</p></div></div>{item.reason && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{formatMovementReason(item.reason, item.reference_id)}</p>}</article>)}</div>
      <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs font-semibold text-slate-500"><tr><th className="px-5 py-3">Fecha</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Producto</th><th className="px-4 py-3">Motivo</th><th className="px-5 py-3 text-right">Cantidad</th></tr></thead><tbody className="divide-y divide-slate-100">{report.items.map(item => <tr key={item.id}><td className="whitespace-nowrap px-5 py-3.5 text-xs text-slate-500">{formatTimestamp(item.created_at)}</td><td className="px-4 py-3.5"><span className={`rounded-full px-2 py-1 text-xs font-bold ${item.type === 'merma' ? 'bg-red-50 text-red-700' : item.type === 'compra' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>{movementLabels[item.type]}</span></td><td className="px-4 py-3.5"><p className="font-semibold text-slate-800">{item.product_name ?? 'Producto eliminado'}</p><p className="text-xs text-slate-400">{item.presentation_name ?? 'Sin presentación'}</p></td><td className="max-w-xs px-4 py-3.5 text-xs text-slate-600">{formatMovementReason(item.reason, item.reference_id) || 'Sin motivo'}</td><td className={`whitespace-nowrap px-5 py-3.5 text-right font-bold ${Number(item.quantity) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{Number(item.quantity) > 0 ? '+' : ''}{Number(item.quantity).toLocaleString('es-AR')} {item.unit}</td></tr>)}</tbody></table></div>
    </div>
  );
}

export function ReportsView({ products }: ReportsViewProps) {
  const initialRange = useMemo(() => getRecentRange(30), []);
  const [draftRange, setDraftRange] = useState<ReportDateRange>(initialRange);
  const [appliedRange, setAppliedRange] = useState<ReportDateRange>(initialRange);
  const [activeTab, setActiveTab] = useState<ReportTab>('profitability');
  const [movementType, setMovementType] = useState<MovementType | ''>('');
  const [productId, setProductId] = useState('');
  const [appliedMovementType, setAppliedMovementType] = useState<MovementType | ''>('');
  const [appliedProductId, setAppliedProductId] = useState('');
  const [offset, setOffset] = useState(0);
  const [profitability, setProfitability] = useState<ProductProfitability[]>([]);
  const [payments, setPayments] = useState<PaymentMethodSummary[]>([]);
  const [movements, setMovements] = useState<InventoryMovementReport>({ total_count: 0, items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    let active = true;
    const handleError = (loadError: unknown) => {
      if (active) setError(messageFor(loadError));
    };
    const finish = () => {
      if (active) setLoading(false);
    };
    if (activeTab === 'profitability') {
      void reportService.getProductProfitability(appliedRange)
        .then(result => { if (active) setProfitability(result); })
        .catch(handleError).finally(finish);
    } else if (activeTab === 'payments') {
      void reportService.getPaymentMethods(appliedRange)
        .then(result => { if (active) setPayments(result); })
        .catch(handleError).finally(finish);
    } else {
      void reportService.getInventoryMovements({ ...appliedRange, type: appliedMovementType || undefined, productId: appliedProductId || undefined, limit: pageSize, offset })
        .then(result => { if (active) setMovements(result); })
        .catch(handleError).finally(finish);
    }
    return () => { active = false; };
  }, [activeTab, appliedRange, appliedMovementType, appliedProductId, offset, reloadKey]);

  const applyFilters = () => {
    setLoading(true);
    setError(null);
    setOffset(0);
    setAppliedRange({ ...draftRange });
    setAppliedMovementType(movementType);
    setAppliedProductId(productId);
    if (draftRange.from === appliedRange.from && draftRange.to === appliedRange.to
      && movementType === appliedMovementType && productId === appliedProductId) {
      setReloadKey(current => current + 1);
    }
  };

  const retry = () => {
    setLoading(true);
    setError(null);
    setReloadKey(current => current + 1);
  };

  const exportReport = async () => {
    setExporting(true);
    setError(null);
    try {
      if (activeTab === 'profitability') {
        const rows = await reportService.getProfitabilityDetail(appliedRange);
        await downloadReportWorkbook({ kind: 'profitability', range: appliedRange, rows });
      } else if (activeTab === 'movements') {
        const rows = await reportService.getAllInventoryMovements({
          ...appliedRange,
          type: appliedMovementType || undefined,
          productId: appliedProductId || undefined,
        });
        await downloadReportWorkbook({
          kind: 'movements', range: appliedRange, rows,
          movementType: appliedMovementType || undefined,
          productName: products.find(product => product.id === appliedProductId)?.name,
        });
      } else {
        return;
      }
    } catch {
      setError('No pudimos generar el archivo Excel. Revisá la conexión y volvé a intentar.');
    } finally {
      setExporting(false);
    }
  };

  const tabs: Array<{ id: ReportTab; label: string }> = [
    { id: 'profitability', label: 'Rentabilidad' },
    { id: 'payments', label: 'Métodos de pago' },
    { id: 'movements', label: 'Movimientos' },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5" data-testid="reports-view">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-2xl font-bold tracking-tight text-slate-800">Reportes</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">La ganancia bruta estimada usa el costo histórico guardado en cada venta. No es ganancia neta: no descuenta impuestos, comisiones ni gastos operativos.</p></div><div className="flex flex-col gap-2 sm:flex-row sm:items-center"><div className="flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm" role="tablist" aria-label="Tipos de reporte">{tabs.map(tab => <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => { setLoading(true); setError(null); setActiveTab(tab.id); setOffset(0); }} className={`rounded-md px-3 py-2 text-xs font-semibold sm:text-sm ${activeTab === tab.id ? 'bg-[#0F172A] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{tab.label}</button>)}</div>{activeTab !== 'payments' && <button type="button" onClick={() => void exportReport()} disabled={loading || exporting} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50" data-testid="export-report"><span className="grid h-6 w-6 place-items-center rounded-md bg-emerald-600 text-white">{exporting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}</span>{exporting ? 'Generando…' : 'Exportar Excel'}</button>}</div></header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Filtros del reporte">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <label className="text-xs font-semibold text-slate-600">Desde<input id="reports-from" name="from" type="date" value={draftRange.from} onChange={event => setDraftRange(current => ({ ...current, from: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
          <label className="text-xs font-semibold text-slate-600">Hasta<input id="reports-to" name="to" type="date" value={draftRange.to} onChange={event => setDraftRange(current => ({ ...current, to: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
          {activeTab === 'movements' ? <><label className="text-xs font-semibold text-slate-600">Tipo<select id="reports-movement-type" name="movement-type" aria-label="Tipo de movimiento" value={movementType} onChange={event => setMovementType(event.target.value as MovementType | '')} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal"><option value="">Todos</option><option value="compra">Compra</option><option value="venta">Venta</option><option value="ajuste">Ajuste</option><option value="merma">Merma</option></select></label><label className="text-xs font-semibold text-slate-600">Producto<select id="reports-product" name="product" aria-label="Producto" value={productId} onChange={event => setProductId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal"><option value="">Todos</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label></> : <div className="hidden lg:block" />}
          <button type="button" onClick={applyFilters} className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-4 text-sm font-semibold text-white hover:bg-blue-700"><Search className="h-4 w-4" />Aplicar filtros</button>
        </div>
      </section>

      {error && <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between"><span className="inline-flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{error}</span><button type="button" onClick={retry} className="inline-flex items-center gap-2 font-semibold"><RefreshCw className="h-4 w-4" />Reintentar</button></div>}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? <ReportLoading /> : activeTab === 'profitability' ? <ProfitabilityReport rows={profitability} /> : activeTab === 'payments' ? <PaymentReport rows={payments} /> : <MovementReport report={movements} />}
        {!loading && activeTab === 'movements' && movements.total_count > 0 && <footer className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500"><span>{offset + 1}–{Math.min(offset + pageSize, movements.total_count)} de {movements.total_count}</span><div className="flex gap-2"><button type="button" disabled={offset === 0} onClick={() => { setLoading(true); setOffset(current => Math.max(0, current - pageSize)); }} className="rounded-lg border border-slate-200 p-2 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></button><button type="button" disabled={offset + pageSize >= movements.total_count} onClick={() => { setLoading(true); setOffset(current => current + pageSize); }} className="rounded-lg border border-slate-200 p-2 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Página siguiente"><ChevronRight className="h-4 w-4" /></button></div></footer>}
      </section>
    </div>
  );
}
