import { lazy, Suspense, useEffect, useState, useMemo } from 'react';
import { productService } from './services/productService';
import { Home, Package, ShoppingCart, Store, Boxes, BarChart2, Settings, Search, Plus, FolderPlus, CheckCircle, Menu, X, LogOut, Coins, TrendingUp, AlertTriangle } from 'lucide-react';
import { supabase } from './lib/supabase';
import type { Database } from './types/database.types';
import type { StockMutationResult } from './services/inventoryService';
import { applyTheme, getStoredTheme, type Theme } from './lib/theme';

const ProductForm = lazy(() => import('./components/ProductForm').then(module => ({ default: module.ProductForm })));
const PurchaseForm = lazy(() => import('./components/PurchaseForm').then(module => ({ default: module.PurchaseForm })));
const PosForm = lazy(() => import('./components/PosForm').then(module => ({ default: module.PosForm })));
const ProductDetail = lazy(() => import('./components/ProductDetail').then(module => ({ default: module.ProductDetail })));
const InventoryView = lazy(() => import('./components/InventoryView').then(module => ({ default: module.InventoryView })));
const CategoryModal = lazy(() => import('./components/CategoryModal').then(module => ({ default: module.CategoryModal })));
const SettingsModal = lazy(() => import('./components/SettingsModal').then(module => ({ default: module.SettingsModal })));
const DashboardView = lazy(() => import('./components/DashboardView').then(module => ({ default: module.DashboardView })));
const ReportsView = lazy(() => import('./components/ReportsView').then(module => ({ default: module.ReportsView })));

type Category = Database['public']['Tables']['categories']['Row'];
type Product = Database['public']['Tables']['products']['Row'] & {
  product_presentations: Database['public']['Tables']['product_presentations']['Row'][];
};
type View = 'inicio' | 'productos' | 'nueva_compra' | 'nuevo_producto' | 'pos' | 'inventario' | 'reportes';

const inventoryCurrency = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 2,
});

function calculateInventoryValuation(products: Product[]) {
  let totalCost = 0;
  let totalSaleValue = 0;
  let stockedPresentations = 0;
  let missingCost = 0;
  let missingPrice = 0;

  for (const product of products) {
    const isWeightProduct = product.type === 'weight';
    for (const presentation of product.product_presentations) {
      const stock = Number(presentation.stock);
      if (!Number.isFinite(stock) || stock <= 0) continue;
      stockedPresentations += 1;

      const cost = Number(presentation.cost);
      const price = Number(presentation.price);
      const weightKg = Number(presentation.weight_kg);
      const pricePerKg = Number(presentation.price_per_kg);

      if (isWeightProduct) {
        if (cost > 0 && weightKg > 0) totalCost += stock * (cost / weightKg);
        else missingCost += 1;

        const effectivePricePerKg = pricePerKg > 0
          ? pricePerKg
          : weightKg > 0 && price > 0 ? price / weightKg : 0;
        if (effectivePricePerKg > 0) totalSaleValue += stock * effectivePricePerKg;
        else missingPrice += 1;
      } else {
        if (cost > 0) totalCost += stock * cost;
        else missingCost += 1;

        if (price > 0) totalSaleValue += stock * price;
        else missingPrice += 1;
      }
    }
  }

  return { totalCost, totalSaleValue, stockedPresentations, missingCost, missingPrice };
}

function App() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentView, setCurrentView] = useState<View>('inicio');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    async function loadData() {
      setLoadError(null);
      try {
        const [cats, prods] = await Promise.all([
          productService.getCategories(),
          productService.getProducts(),
        ]);
        setCategories(cats || []);
        setProducts(prods || []);
      } catch (error) {
        console.error('Error loading data:', error);
        setLoadError('No se pudo actualizar el catálogo. Revisá la conexión y volvé a intentar.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [refreshKey]);

  const handleRefresh = () => {
    setRefreshKey(k => k + 1);
  };

  const handleStockChanged = (result: StockMutationResult) => {
    const nextStock = Number(result.stock_after);
    setProducts(currentProducts => currentProducts.map(product => (
      product.id !== result.product_id
        ? product
        : {
            ...product,
            product_presentations: product.product_presentations.map(presentation => (
              presentation.id === result.presentation_id
                ? { ...presentation, stock: nextStock }
                : presentation
            )),
          }
    )));
  };

  const navigateTo = (view: View) => {
    setCurrentView(view);
    setMobileNavOpen(false);
  };

  const handleSignOut = () => {
    setMobileNavOpen(false);
    void supabase.auth.signOut();
  };

  const openSettings = () => {
    setMobileNavOpen(false);
    setIsSettingsOpen(true);
  };

  useEffect(() => {
    if (!mobileNavOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileNavOpen]);

  const handleProductCreated = (name: string) => {
    navigateTo('productos');
    setSuccessBanner(`Producto "${name}" creado exitosamente.`);
    handleRefresh();
    setTimeout(() => setSuccessBanner(null), 4500);
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = !searchTerm.trim() || 
        p.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = !categoryFilter || p.category_id === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, categoryFilter]);

  const inventoryValuation = useMemo(() => calculateInventoryValuation(products), [products]);

  return (
    <div className="app-workspace-background flex h-dvh flex-col overflow-hidden font-sans text-slate-900 lg:flex-row">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-700/70 bg-[#0F172A] px-4 text-white shadow-sm lg:hidden">
        <div className="flex items-center gap-2.5">
          <Store className="h-7 w-7" />
          <div className="flex flex-col">
            <span className="text-lg font-bold leading-none">Avenida Animal</span>
            <span className="text-[9px] text-slate-400">Alimentos y Accesorios</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="rounded-lg border border-slate-700 p-2 text-slate-200 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
          aria-label="Abrir menú"
          aria-expanded={mobileNavOpen}
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      <aside className="hidden w-64 shrink-0 flex-col bg-[#0F172A] text-slate-300 lg:flex">
        <div className="p-6">
          <div className="flex items-center gap-3 text-white mb-8">
            <div className="p-1">
              <Store className="w-8 h-8 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-xl leading-none">Avenida Animal</span>
              <span className="text-[10px] text-slate-400">Alimentos y Accesorios</span>
            </div>
          </div>
          
          <nav className="flex flex-col gap-1.5 mt-4">
            <button
              type="button"
              onClick={() => navigateTo('inicio')}
              aria-current={currentView === 'inicio' ? 'page' : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full text-left ${currentView === 'inicio' ? 'bg-blue-500/10 text-blue-400 border-l-2 border-blue-500' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <Home className="w-5 h-5" />
              <span className="font-medium text-sm">Inicio</span>
            </button>
            <button 
              type="button"
              onClick={() => navigateTo('productos')}
              aria-current={currentView === 'productos' || currentView === 'nuevo_producto' ? 'page' : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full text-left ${currentView === 'productos' || currentView === 'nuevo_producto' ? 'bg-blue-500/10 text-blue-400 border-l-2 border-blue-500' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <Package className="w-5 h-5" />
              <span className="font-medium text-sm">Productos</span>
            </button>
            <button 
              type="button"
              onClick={() => navigateTo('nueva_compra')}
              aria-current={currentView === 'nueva_compra' ? 'page' : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full text-left ${currentView === 'nueva_compra' ? 'bg-blue-500/10 text-blue-400 border-l-2 border-blue-500' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <ShoppingCart className="w-5 h-5" />
              <span className="font-medium text-sm">Compras</span>
            </button>
            <button 
              type="button"
              onClick={() => navigateTo('pos')}
              aria-current={currentView === 'pos' ? 'page' : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full text-left ${currentView === 'pos' ? 'bg-blue-500/10 text-blue-400 border-l-2 border-blue-500' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <Store className="w-5 h-5" />
              <span className="font-medium text-sm">Punto de Venta</span>
            </button>
            <button 
              type="button"
              onClick={() => navigateTo('inventario')}
              aria-current={currentView === 'inventario' ? 'page' : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full text-left ${currentView === 'inventario' ? 'bg-blue-500/10 text-blue-400 border-l-2 border-blue-500' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <Boxes className="w-5 h-5" />
              <span className="font-medium text-sm">Inventario</span>
            </button>
            <button
              type="button"
              onClick={() => navigateTo('reportes')}
              aria-current={currentView === 'reportes' ? 'page' : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full text-left ${currentView === 'reportes' ? 'bg-blue-500/10 text-blue-400 border-l-2 border-blue-500' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <BarChart2 className="w-5 h-5" />
              <span className="font-medium text-sm">Reportes</span>
            </button>
          </nav>
        </div>
        <div className="mt-auto space-y-1.5 border-t border-slate-800 p-6">
          <button type="button" onClick={openSettings} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors w-full text-left">
            <Settings className="w-5 h-5" />
            <span className="font-medium text-sm">Configuración</span>
          </button>
          <button type="button" onClick={handleSignOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-300">
            <LogOut className="h-5 w-5" />
            <span className="text-sm font-medium">Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {mobileNavOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[2px] lg:hidden"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Cerrar menú"
          />
          <aside
            className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,86vw)] flex-col bg-[#0F172A] text-slate-300 shadow-2xl lg:hidden"
            aria-label="Navegación principal"
          >
            <div className="p-5">
              <div className="mb-8 flex items-center justify-between text-white">
                <div className="flex items-center gap-3">
                  <Store className="h-8 w-8" />
                  <div className="flex flex-col">
                    <span className="text-xl font-bold leading-none">Avenida Animal</span>
                    <span className="text-[10px] text-slate-400">Alimentos y Accesorios</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  aria-label="Cerrar menú"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav className="flex flex-col gap-1.5" aria-label="Secciones">
                {[
                  { view: 'inicio' as View, label: 'Inicio', icon: Home, active: currentView === 'inicio' },
                  { view: 'productos' as View, label: 'Productos', icon: Package, active: currentView === 'productos' || currentView === 'nuevo_producto' },
                  { view: 'nueva_compra' as View, label: 'Compras', icon: ShoppingCart, active: currentView === 'nueva_compra' },
                  { view: 'pos' as View, label: 'Punto de Venta', icon: Store, active: currentView === 'pos' },
                  { view: 'inventario' as View, label: 'Inventario', icon: Boxes, active: currentView === 'inventario' },
                  { view: 'reportes' as View, label: 'Reportes', icon: BarChart2, active: currentView === 'reportes' },
                ].map(({ view, label, icon: Icon, active }) => (
                  <button
                    key={view}
                    type="button"
                    onClick={() => navigateTo(view)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors ${active ? 'border-l-2 border-blue-500 bg-blue-500/10 text-blue-400' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-sm font-medium">{label}</span>
                  </button>
                ))}
              </nav>
            </div>
            <div className="mt-auto space-y-1.5 border-t border-slate-800 p-5">
              <button type="button" onClick={openSettings} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
                <Settings className="h-5 w-5" />
                <span className="text-sm font-medium">Configuración</span>
              </button>
              <button type="button" onClick={handleSignOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-300">
                <LogOut className="h-5 w-5" />
                <span className="text-sm font-medium">Cerrar sesión</span>
              </button>
            </div>
          </aside>
        </>
      )}

      {/* Main Content */}
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:h-full lg:p-8">
        {loadError && (
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between" role="alert">
            <span>{loadError}</span>
            <button type="button" onClick={() => { setLoading(true); handleRefresh(); }} className="font-semibold text-red-700 underline-offset-2 hover:underline">
              Reintentar
            </button>
          </div>
        )}
        <Suspense fallback={<div className="grid min-h-56 place-items-center text-sm text-slate-500">Cargando sección…</div>}>

        {currentView === 'inicio' && (
          <DashboardView
            products={products}
            onOpenProducts={() => navigateTo('productos')}
            onOpenPurchase={() => navigateTo('nueva_compra')}
            onOpenSale={() => navigateTo('pos')}
          />
        )}
        
        {currentView === 'productos' && (
          <div className="flex min-h-full flex-col gap-4">
            {/* Banner de éxito */}
            {successBanner && (
              <div
                className="flex items-center gap-2.5 bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-sm shadow-sm animate-fadeIn"
                data-testid="product-success-banner"
                role="status"
                aria-live="polite"
              >
                <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                <span className="font-medium">{successBanner}</span>
              </div>
            )}

            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Productos</h1>
                <p className="text-xs text-slate-500 mt-0.5">Catálogo de productos, presentaciones y control de stock</p>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:flex sm:items-center">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(true)}
                  className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                  data-testid="btn-manage-categories"
                >
                  <FolderPlus className="w-4 h-4 text-[#2563EB]" />
                  Categorías
                </button>
                <button 
                  type="button"
                  onClick={() => navigateTo('nuevo_producto')}
                  className="flex items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
                  data-testid="btn-new-product"
                >
                  <Plus className="w-4 h-4" />
                  Nuevo producto
                </button>
              </div>
            </header>

            <section
              className="grid gap-3 sm:grid-cols-2"
              aria-label="Resumen de valorización del inventario"
              data-testid="inventory-valuation-summary"
            >
              <article className="rounded-xl border border-slate-200 border-l-4 border-l-blue-500 bg-white px-5 py-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-600">Costo del inventario</p>
                    <p className="mt-1 text-xs text-slate-400">Stock actual a costo registrado</p>
                  </div>
                  <span className="rounded-lg bg-blue-50 p-2 text-blue-600" aria-hidden="true">
                    <Coins className="h-5 w-5" />
                  </span>
                </div>
                <p className="mt-4 text-2xl font-bold tracking-tight text-slate-900" data-testid="inventory-total-cost">
                  {loading ? '—' : inventoryCurrency.format(inventoryValuation.totalCost)}
                </p>
                <p className={`mt-2 flex items-center gap-1.5 text-xs ${inventoryValuation.missingCost > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                  {inventoryValuation.missingCost > 0 && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                  {loading
                    ? 'Calculando stock actual…'
                    : inventoryValuation.stockedPresentations === 0
                      ? 'No hay presentaciones con stock.'
                      : inventoryValuation.missingCost > 0
                        ? `${inventoryValuation.missingCost} presentación${inventoryValuation.missingCost === 1 ? '' : 'es'} con stock sin costo.`
                        : 'Todas las presentaciones con stock están incluidas.'}
                </p>
              </article>

              <article className="rounded-xl border border-slate-200 border-l-4 border-l-emerald-500 bg-white px-5 py-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-600">Valor potencial de venta</p>
                    <p className="mt-1 text-xs text-slate-400">Stock actual a precios vigentes</p>
                  </div>
                  <span className="rounded-lg bg-emerald-50 p-2 text-emerald-600" aria-hidden="true">
                    <TrendingUp className="h-5 w-5" />
                  </span>
                </div>
                <p className="mt-4 text-2xl font-bold tracking-tight text-emerald-800" data-testid="inventory-total-sale-value">
                  {loading ? '—' : inventoryCurrency.format(inventoryValuation.totalSaleValue)}
                </p>
                <p className={`mt-2 flex items-center gap-1.5 text-xs ${inventoryValuation.missingPrice > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                  {inventoryValuation.missingPrice > 0 && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                  {loading
                    ? 'Calculando stock actual…'
                    : inventoryValuation.stockedPresentations === 0
                      ? 'No hay presentaciones con stock.'
                      : inventoryValuation.missingPrice > 0
                        ? `${inventoryValuation.missingPrice} presentación${inventoryValuation.missingPrice === 1 ? '' : 'es'} con stock sin precio.`
                        : 'Importe bruto estimado antes de descontar costos.'}
                </p>
              </article>
            </section>

            <section className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-md sm:flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Buscar por nombre..." 
                    aria-label="Buscar productos por nombre"
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all"
                    data-testid="search-product-input"
                  />
                </div>
                <div className="flex w-full gap-3 sm:w-auto">
                  <select
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    aria-label="Filtrar productos por categoría"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#2563EB] sm:w-auto"
                    data-testid="filter-category-select"
                  >
                    <option value="">Todas las categorías ({categories.length})</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              {loading ? (
                <div className="p-12 text-center text-slate-400" role="status" aria-live="polite">Cargando catálogo...</div>
              ) : filteredProducts.length === 0 ? (
                <div className="p-12 text-center italic text-slate-400" role="status">
                  {products.length === 0 
                    ? 'No hay productos registrados.' 
                    : 'No se encontraron productos con los filtros aplicados.'}
                </div>
              ) : (
                <div className="md:overflow-x-auto">
                  <table className="block w-full border-collapse text-left md:table">
                    <thead className="hidden md:table-header-group">
                      <tr className="border-b border-slate-200 text-slate-500 text-xs font-semibold uppercase tracking-wider bg-slate-50/50">
                        <th className="py-3 px-6 font-semibold">Código</th>
                        <th className="py-3 px-6 font-semibold">Producto</th>
                        <th className="py-3 px-6 font-semibold">Categoría</th>
                        <th className="py-3 px-6 font-semibold">Tipo</th>
                        <th className="py-3 px-6 font-semibold">Stock Total</th>
                        <th className="py-3 px-6 font-semibold">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="block space-y-3 bg-slate-50/60 p-3 md:table-row-group md:space-y-0 md:bg-transparent md:p-0">
                      {filteredProducts.map((p, idx) => (
                        <ProductDetail
                          key={p.id}
                          product={p}
                          categoryName={categories.find((c) => c.id === p.category_id)?.name || '-'}
                          categories={categories}
                          idx={idx}
                          onUpdated={handleRefresh}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        {currentView === 'nueva_compra' && (
          <div className="mx-auto w-full max-w-6xl">
            <PurchaseForm
              onPurchaseAdded={() => {
                navigateTo('productos');
                setSuccessBanner('Compra registrada y stock actualizado con éxito.');
                handleRefresh();
                setTimeout(() => setSuccessBanner(null), 4500);
              }}
              onCancel={() => navigateTo('productos')}
            />
          </div>
        )}

        {currentView === 'nuevo_producto' && (
          <div className="max-w-2xl mx-auto">
            <ProductForm onProductAdded={handleProductCreated} onCancel={() => navigateTo('productos')} />
          </div>
        )}

        {currentView === 'pos' && (
          <div className="mx-auto min-h-full max-w-5xl lg:h-full">
            <PosForm onSaleComplete={handleRefresh} />
          </div>
        )}

        {currentView === 'inventario' && (
          <div className="mx-auto min-h-full max-w-5xl">
            <InventoryView products={products} onStockChanged={handleStockChanged} />
          </div>
        )}

        {currentView === 'reportes' && (
          <ReportsView products={products} />
        )}

        </Suspense>

      </main>

      {/* Modal de Gestión de Categorías */}
      {isCategoryModalOpen && (
        <Suspense fallback={null}>
          <CategoryModal
            isOpen
            onClose={() => setIsCategoryModalOpen(false)}
            categories={categories}
            onCategoryChanged={handleRefresh}
          />
        </Suspense>
      )}
      {isSettingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal
            isOpen
            onClose={() => setIsSettingsOpen(false)}
            theme={theme}
            onThemeChange={setTheme}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;
