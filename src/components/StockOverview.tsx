import { AlertTriangle, ArrowRight, Boxes, Package, ShoppingCart, Store } from 'lucide-react';
import type { Database } from '../types/database.types';

type Product = Database['public']['Tables']['products']['Row'] & {
  product_presentations: Database['public']['Tables']['product_presentations']['Row'][];
};

interface StockOverviewProps {
  products: Product[];
  loading: boolean;
  onOpenProducts: () => void;
  onOpenPurchase: () => void;
  onOpenSale: () => void;
}

function productStock(product: Product): number {
  return product.product_presentations.reduce((total, presentation) => total + Number(presentation.stock || 0), 0);
}

function formatStock(product: Product, stock: number): string {
  return `${stock.toLocaleString('es-AR', { maximumFractionDigits: product.type === 'weight' ? 3 : 0 })} ${product.type === 'weight' ? 'kg' : 'uds'}`;
}

function stockStatus(product: Product, stock: number): { label: string; className: string; priority: number } {
  if (stock <= 0) return { label: 'Sin stock', className: 'border-red-200 bg-red-50 text-red-700', priority: 0 };
  if (stock <= Number(product.min_stock || 0)) return { label: 'Stock bajo', className: 'border-amber-200 bg-amber-50 text-amber-700', priority: 1 };
  return { label: 'Disponible', className: 'border-emerald-200 bg-emerald-50 text-emerald-700', priority: 2 };
}

export function StockOverview({ products, loading, onOpenProducts, onOpenPurchase, onOpenSale }: StockOverviewProps) {
  const activeProducts = products.filter(product => product.status === 'active');
  const rows = activeProducts
    .map(product => {
      const stock = productStock(product);
      return { product, stock, status: stockStatus(product, stock) };
    })
    .sort((left, right) => left.status.priority - right.status.priority || left.product.name.localeCompare(right.product.name));
  const presentationCount = activeProducts.reduce((total, product) => total + product.product_presentations.length, 0);
  const attentionCount = rows.filter(row => row.status.priority < 2).length;
  const availableCount = rows.filter(row => row.stock > 0).length;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-5" data-testid="stock-overview">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Estado del stock</h1>
          <p className="mt-1 text-sm text-slate-500">Una vista rápida de lo disponible y lo que necesita reposición.</p>
        </div>
        <button type="button" onClick={onOpenSale} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
          <Store className="h-4 w-4" />
          Abrir punto de venta
        </button>
      </header>

      <section className="grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:grid-cols-2 lg:grid-cols-4" aria-label="Resumen de inventario">
        <div className="border-b border-slate-100 p-5 sm:border-r lg:border-b-0">
          <span className="text-sm text-slate-500">Productos activos</span>
          <strong className="mt-1 block text-3xl text-slate-900">{activeProducts.length}</strong>
        </div>
        <div className="border-b border-slate-100 p-5 lg:border-b-0 lg:border-r">
          <span className="text-sm text-slate-500">Presentaciones</span>
          <strong className="mt-1 block text-3xl text-slate-900">{presentationCount}</strong>
        </div>
        <div className="border-b border-slate-100 p-5 sm:border-b-0 sm:border-r">
          <span className="text-sm text-slate-500">Con disponibilidad</span>
          <strong className="mt-1 block text-3xl text-emerald-600">{availableCount}</strong>
        </div>
        <div className={`p-5 ${attentionCount ? 'bg-amber-50/60' : ''}`}>
          <span className="text-sm text-slate-500">Requieren atención</span>
          <strong className={`mt-1 block text-3xl ${attentionCount ? 'text-amber-700' : 'text-slate-900'}`}>{attentionCount}</strong>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="font-semibold text-slate-800">Stock por producto</h2>
              <p className="mt-0.5 text-xs text-slate-500">Los productos críticos aparecen primero.</p>
            </div>
            <button type="button" onClick={onOpenProducts} className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
              Ver catálogo <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {loading ? (
            <div className="p-10 text-center text-sm text-slate-400">Cargando stock…</div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <Package className="mb-3 h-9 w-9 text-slate-300" />
              <h3 className="font-medium text-slate-700">Todavía no hay productos activos</h3>
              <p className="mt-1 max-w-sm text-sm text-slate-500">Creá el primer producto y su presentación para comenzar a controlar el stock.</p>
              <button type="button" onClick={onOpenProducts} className="mt-4 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Ir a productos</button>
            </div>
          ) : (
            <div data-testid="mobile-stock-list">
              <table className="block w-full text-left sm:table">
                <thead className="hidden bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:table-header-group">
                  <tr><th className="px-5 py-3">Producto</th><th className="px-5 py-3">Stock total</th><th className="px-5 py-3">Mínimo</th><th className="px-5 py-3">Estado</th></tr>
                </thead>
                <tbody className="block divide-y divide-slate-100 sm:table-row-group">
                  {rows.map(({ product, stock, status }) => (
                    <tr key={product.id} className="grid grid-cols-2 gap-x-3 gap-y-2 px-4 py-4 hover:bg-slate-50/70 sm:table-row sm:p-0">
                      <td className="col-span-2 pb-1 sm:table-cell sm:px-5 sm:py-3.5">
                        <span className="block truncate text-sm font-medium text-slate-800">{product.name}</span>
                        <span className="text-xs text-slate-400">{product.product_presentations.length} {product.product_presentations.length === 1 ? 'presentación' : 'presentaciones'}</span>
                      </td>
                      <td className="sm:table-cell sm:px-5 sm:py-3.5">
                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:hidden">Stock total</span>
                        <span className="text-sm font-semibold text-slate-800">{formatStock(product, stock)}</span>
                      </td>
                      <td className="sm:table-cell sm:px-5 sm:py-3.5">
                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:hidden">Mínimo</span>
                        <span className="text-sm text-slate-500">{formatStock(product, Number(product.min_stock || 0))}</span>
                      </td>
                      <td className="col-span-2 pt-1 sm:table-cell sm:px-5 sm:py-3.5"><span className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${status.className}`}>{status.label}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            {attentionCount ? <AlertTriangle className="h-5 w-5 text-amber-600" /> : <Boxes className="h-5 w-5 text-emerald-600" />}
            <h2 className="font-semibold text-slate-800">Acciones rápidas</h2>
          </div>
          <div className="space-y-2">
            <button type="button" onClick={onOpenSale} className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3.5 py-3 text-left text-sm font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"><Store className="h-4 w-4" /> Nueva venta</button>
            <button type="button" onClick={onOpenPurchase} className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3.5 py-3 text-left text-sm font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"><ShoppingCart className="h-4 w-4" /> Registrar compra</button>
            <button type="button" onClick={onOpenProducts} className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3.5 py-3 text-left text-sm font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"><Package className="h-4 w-4" /> Administrar productos</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
