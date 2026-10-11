import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays,
  PackageSearch, RefreshCw, ShoppingCart, Store, TrendingUp, WalletCards,
} from 'lucide-react';
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis, type TooltipContentProps,
} from 'recharts';
import { formatShortDate, formatTimestamp, getRecentRange } from '../lib/reportDates';
import { compactCurrency, formatMoney, paymentLabels, reportLongDate } from '../lib/reportFormatting';
import { reportService, type DashboardAnalytics, type ReportDateRange } from '../services/reportService';
import type { Database } from '../types/database.types';

type DashboardProduct = Database['public']['Tables']['products']['Row'] & {
  product_presentations: Database['public']['Tables']['product_presentations']['Row'][];
};

interface DashboardViewProps {
  products: DashboardProduct[];
  onOpenProducts: () => void;
  onOpenPurchase: () => void;
  onOpenSale: () => void;
}

function getCatalogLowStock(products: DashboardProduct[]): DashboardAnalytics['low_stock'] {
  return products
    .filter(product => product.status === 'active')
    .flatMap(product => {
      const productType: 'weight' | 'unit' = product.type === 'weight' ? 'weight' : 'unit';
      const configuredMinimum = Number(product.min_stock);
      const restockThreshold = Math.max(Number.isFinite(configuredMinimum) ? configuredMinimum : 0, 5);

      return product.product_presentations
        .filter(presentation => Number(presentation.stock) <= restockThreshold)
        .map(presentation => ({
          product_id: product.id,
          product_name: product.name,
          presentation_id: presentation.id,
          presentation_name: presentation.name,
          product_type: productType,
          current_stock: Number(presentation.stock).toFixed(3) as `${number}`,
          min_stock: restockThreshold.toFixed(3) as `${number}`,
          unit: productType === 'weight' ? 'kg' as const : 'uds' as const,
        }));
    })
    .sort((left, right) => {
      const byStock = Number(left.current_stock) - Number(right.current_stock);
      if (byStock !== 0) return byStock;
      const byDeficit = (Number(left.current_stock) - Number(left.min_stock))
        - (Number(right.current_stock) - Number(right.min_stock));
      if (byDeficit !== 0) return byDeficit;
      return `${left.product_name} ${left.presentation_name}`.localeCompare(
        `${right.product_name} ${right.presentation_name}`,
        'es',
      );
    });
}

function reportError(error: unknown): string {
  if (error instanceof Error && error.message === 'DATE_RANGE_TOO_LARGE') return 'El período no puede superar 366 días.';
  if (error instanceof Error && error.message === 'INVALID_DATE_RANGE') return 'Revisá las fechas seleccionadas.';
  return 'No pudimos cargar las métricas. Reintentá en unos segundos.';
}

function Variation({ value, label }: { value: string | null; label: string }) {
  if (value === null) return <span className="text-xs text-slate-600">Sin base comparable</span>;
  const amount = Number(value);
  const PositiveIcon = amount >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
      <PositiveIcon className="h-3.5 w-3.5" aria-hidden="true" />
      {Math.abs(amount).toLocaleString('es-AR', { maximumFractionDigits: 2 })}% {label}
    </span>
  );
}

function SalesChart({ data }: { data: DashboardAnalytics['daily_sales'] }) {
  const [visible, setVisible] = useState({ sales: true, profit: true });
  const chartData = useMemo(() => data.map(item => ({
    ...item,
    salesValue: Number(item.sales),
    profitValue: Number(item.gross_profit),
  })), [data]);

  const toggleSeries = (series: keyof typeof visible) => {
    setVisible(current => {
      if (current[series] && Object.values(current).filter(Boolean).length === 1) return current;
      return { ...current, [series]: !current[series] };
    });
  };

  const ChartTooltip = ({ active, payload }: TooltipContentProps) => {
    const raw: unknown = payload[0]?.payload;
    if (!active || !raw || typeof raw !== 'object') return null;
    const point = raw as DashboardAnalytics['daily_sales'][number];
    return (
      <div className="min-w-56 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur-sm" data-testid="sales-chart-tooltip">
        <p className="text-sm font-bold capitalize text-slate-800">{reportLongDate.format(new Date(`${point.date}T12:00:00Z`))}</p>
        <div className="mt-3 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-6"><span className="flex items-center gap-2 text-slate-500"><span className="h-2 w-2 rounded-full bg-blue-600" />Ventas</span><strong className="text-slate-800">{formatMoney(point.sales)}</strong></div>
          <div className="flex items-center justify-between gap-6"><span className="text-slate-500">Costo histórico</span><strong className="text-slate-700">{formatMoney(point.total_cost)}</strong></div>
          <div className="flex items-center justify-between gap-6"><span className="flex items-center gap-2 text-slate-500"><span className="h-2 w-2 rounded-full bg-emerald-500" />Ganancia bruta estimada</span><strong className={Number(point.gross_profit) >= 0 ? 'text-emerald-700' : 'text-red-600'}>{formatMoney(point.gross_profit)}</strong></div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-500">
          <span>{point.sales_count} {point.sales_count === 1 ? 'venta' : 'ventas'}</span>
          <span>{point.margin_pct === null ? 'Sin margen' : `${Number(point.margin_pct).toLocaleString('es-AR')}% de margen`}</span>
        </div>
      </div>
    );
  };

  if (data.length === 0) return <div className="grid h-56 place-items-center text-sm text-slate-400">Todavía no hay días para mostrar.</div>;

  return (
    <div className="min-w-0" data-testid="sales-chart">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <button type="button" aria-pressed={visible.sales} onClick={() => toggleSeries('sales')} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-semibold transition-colors ${visible.sales ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-400'}`}>
          <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />Ventas
        </button>
        <button type="button" aria-pressed={visible.profit} onClick={() => toggleSeries('profit')} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-semibold transition-colors ${visible.profit ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-400'}`}>
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Ganancia bruta estimada
        </button>
        <span className="ml-auto hidden text-[11px] text-slate-600 sm:inline">Pasá el cursor por un día para ver el detalle</span>
      </div>
      <div className="h-72 w-full" role="img" aria-label="Gráfico interactivo de ventas y ganancia bruta estimada por día">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 12, right: 8, bottom: 4, left: 0 }} accessibilityLayer>
            <defs>
              <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563EB" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#2563EB" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#E2E8F0" strokeDasharray="3 6" />
            <XAxis dataKey="date" tickFormatter={formatShortDate} axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} minTickGap={data.length > 7 ? 24 : 8} interval={data.length <= 7 ? 0 : 'preserveStartEnd'} dy={8} />
            <YAxis tickFormatter={value => compactCurrency.format(value)} axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 10 }} width={64} />
            <ReferenceLine y={0} stroke="#CBD5E1" />
            <Tooltip content={ChartTooltip} cursor={{ stroke: '#94A3B8', strokeWidth: 1, strokeDasharray: '4 4' }} isAnimationActive="auto" />
            {visible.sales && <Area type="monotone" dataKey="salesValue" name="Ventas" stroke="#2563EB" strokeWidth={3} fill="url(#salesGradient)" activeDot={{ r: 6, strokeWidth: 3, stroke: '#FFFFFF', fill: '#2563EB' }} isAnimationActive={false} />}
            {visible.profit && <Line type="monotone" dataKey="profitValue" name="Ganancia bruta estimada" stroke="#059669" strokeWidth={3} dot={false} activeDot={{ r: 5, strokeWidth: 3, stroke: '#FFFFFF', fill: '#059669' }} isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-label="Cargando dashboard">
      <div className="h-24 animate-pulse rounded-2xl bg-slate-200" />
      <div className="grid gap-4 md:grid-cols-3">{[1, 2, 3].map(item => <div key={item} className="h-36 animate-pulse rounded-xl bg-slate-200" />)}</div>
      <div className="h-80 animate-pulse rounded-xl bg-slate-200" />
    </div>
  );
}

export function DashboardView({ products, onOpenProducts, onOpenPurchase, onOpenSale }: DashboardViewProps) {
  const [range, setRange] = useState<ReportDateRange>(() => getRecentRange(7));
  const [data, setData] = useState<DashboardAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    void reportService.getDashboard(range).then(result => {
      if (active) {
        setData(result);
        setError(null);
      }
    }).catch(loadError => {
      if (active) setError(reportError(loadError));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [range, reloadKey]);

  const choosePeriod = (days: number) => {
    setLoading(true);
    setError(null);
    setRange(getRecentRange(days));
  };

  const retry = () => {
    setLoading(true);
    setError(null);
    setReloadKey(current => current + 1);
  };

  if (loading && !data) return <DashboardSkeleton />;

  if (error && !data) {
    return (
      <section className="mx-auto grid min-h-[60vh] max-w-xl place-items-center text-center" data-testid="dashboard-error">
        <div className="rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
          <AlertTriangle className="mx-auto h-10 w-10 text-red-500" />
          <h1 className="mt-4 text-xl font-bold text-slate-800">Las métricas no están disponibles</h1>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
          <button type="button" onClick={retry} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            <RefreshCw className="h-4 w-4" />Reintentar
          </button>
        </div>
      </section>
    );
  }

  if (!data) return null;

  const catalogLowStock = getCatalogLowStock(products);
  const lowStock = products.length > 0 ? catalogLowStock : data.low_stock;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5" data-testid="analytics-dashboard">
      <header className="overflow-hidden rounded-2xl border border-slate-200 bg-[#0F172A] text-white shadow-sm">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-300">Resumen operativo</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">El pulso de Avenida Animal</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">Ventas, rentabilidad y reposición en una sola lectura.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onOpenSale} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-800"><Store className="h-4 w-4" />Nueva venta</button>
            <button type="button" onClick={onOpenPurchase} className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3.5 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800"><ShoppingCart className="h-4 w-4" />Registrar compra</button>
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-700/80 bg-slate-900/70 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="inline-flex items-center gap-2 text-xs text-slate-300"><CalendarDays className="h-4 w-4 text-blue-300" />Período: {formatShortDate(range.from)} al {formatShortDate(range.to)}</div>
          <div className="flex gap-1 rounded-lg bg-slate-800 p-1" aria-label="Seleccionar período">
            {[7, 30].map(days => (
              <button key={days} type="button" onClick={() => choosePeriod(days)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${range.from === getRecentRange(days).from ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'}`}>{days} días</button>
            ))}
          </div>
        </div>
      </header>

      {error && <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"><span>{error} Se mantienen los últimos datos.</span><button type="button" onClick={retry} className="font-semibold underline">Reintentar</button></div>}

      <section className="grid gap-3 md:grid-cols-3" aria-label="Métricas principales">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="metric-today-sales">
          <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">Vendido hoy</span><WalletCards className="h-5 w-5 text-blue-600" /></div>
          <p className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{formatMoney(data.today.total_amount)}</p>
          <div className="mt-2"><Variation value={data.today.sales_change_pct} label="vs. ayer" /></div>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="metric-period-sales">
          <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">Vendido en el período</span><TrendingUp className="h-5 w-5 text-blue-600" /></div>
          <p className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{formatMoney(data.selected_period.total_amount)}</p>
          <div className="mt-2"><Variation value={data.selected_period.sales_change_pct} label="vs. período anterior" /></div>
        </article>
        <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm" data-testid="metric-period-profit">
          <div className="flex items-center justify-between"><span className="text-sm font-medium text-emerald-800">Ganancia bruta estimada</span><span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-emerald-700">{data.selected_period.margin_pct === null ? 'Sin margen' : `${Number(data.selected_period.margin_pct).toLocaleString('es-AR')}%`}</span></div>
          <p className="mt-4 text-2xl font-bold tracking-tight text-emerald-800">{formatMoney(data.selected_period.gross_profit)}</p>
          <div className="mt-2"><Variation value={data.selected_period.profit_change_pct} label="vs. período anterior" /></div>
          <p className="mt-2 text-xs leading-5 text-emerald-800/80">No equivale a ganancia neta: no descuenta impuestos, comisiones ni gastos operativos.</p>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
        <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5"><h2 className="text-lg font-bold text-slate-800">Ventas y ganancia bruta estimada por día</h2><p className="mt-1 text-xs text-slate-500">Importes y costos históricos confirmados por el servidor.</p></div>
          <SalesChart data={data.daily_sales} />
        </article>
        <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" data-testid="low-stock-panel">
          <div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="font-bold text-slate-800">Stock bajo</h2><p className="mt-1 text-xs text-slate-500">Presentaciones próximas a agotarse.</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">{lowStock.length}</span></div>
          {lowStock.length === 0 ? (
            <div className="p-8 text-center"><PackageSearch className="mx-auto h-9 w-9 text-emerald-500" /><p className="mt-3 text-sm font-semibold text-slate-700">Stock en orden</p><p className="mt-1 text-xs text-slate-500">Ninguna presentación está próxima a agotarse.</p></div>
          ) : (
            <div className="divide-y divide-slate-100">
              {lowStock.slice(0, 6).map(item => {
                const currentStock = Number(item.current_stock);
                const formatStock = (value: number) => value.toLocaleString('es-AR', {
                  maximumFractionDigits: item.product_type === 'unit' ? 0 : 3,
                });
                const exhausted = currentStock <= 0;
                return (
                  <div key={item.presentation_id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{item.product_name}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{item.presentation_name} · Reponer desde {formatStock(Number(item.min_stock))} {item.unit}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`inline-flex rounded-lg border px-2.5 py-1 text-xs font-bold ${exhausted ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{formatStock(currentStock)} {item.unit}</span>
                      <p className={`mt-1 text-[11px] font-semibold ${exhausted ? 'text-red-600' : 'text-amber-600'}`}>{exhausted ? 'Agotado' : 'Queda poco'}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <button type="button" onClick={onOpenProducts} className="flex w-full items-center justify-center gap-2 border-t border-slate-100 px-4 py-3 text-sm font-semibold text-blue-600 hover:bg-blue-50">Ver detalle <ArrowRight className="h-4 w-4" /></button>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-800">Últimas ventas</h2></div>
          {data.recent_sales.length === 0 ? <p className="p-6 text-sm text-slate-500">La primera venta aparecerá acá.</p> : <div className="divide-y divide-slate-100">{data.recent_sales.map(sale => <div key={sale.id} className="flex items-center justify-between gap-4 px-5 py-3"><div><p className="text-sm font-semibold text-slate-700">{paymentLabels[sale.payment_method]}</p><p className="text-xs text-slate-400">{formatTimestamp(sale.created_at)}</p></div><div className="text-right"><p className="text-sm font-bold text-slate-800">{formatMoney(sale.total_amount)}</p><p className="text-xs text-emerald-600" title="Ganancia bruta estimada">Ganancia bruta estimada: {formatMoney(sale.gross_profit)}</p></div></div>)}</div>}
        </article>
        <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-5"><h2 className="font-bold text-slate-800">Últimas compras</h2></div>
          {data.recent_purchases.length === 0 ? <p className="p-6 text-sm text-slate-500">La primera compra aparecerá acá.</p> : <div className="divide-y divide-slate-100">{data.recent_purchases.map(purchase => <div key={purchase.id} className="flex items-center justify-between gap-4 px-5 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-700">{purchase.supplier_name ?? 'Proveedor sin nombre'}</p><p className="text-xs text-slate-400">{formatTimestamp(purchase.created_at)}</p></div><p className="shrink-0 text-sm font-bold text-slate-800">{formatMoney(purchase.total_amount)}</p></div>)}</div>}
        </article>
      </section>
    </div>
  );
}
