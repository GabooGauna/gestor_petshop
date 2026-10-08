import { useEffect, useState } from 'react';
import { productService } from './services/productService';
import { ProductForm } from './components/ProductForm';
import { PurchaseForm } from './components/PurchaseForm';
import { PosForm } from './components/PosForm';
import { ProductDetail } from './components/ProductDetail';
import { InventoryView } from './components/InventoryView';
import { Home, Package, ShoppingCart, Store, Boxes, BarChart2, Settings, Search, Plus } from 'lucide-react';

function App() {
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentView, setCurrentView] = useState<'productos' | 'nueva_compra' | 'nuevo_producto' | 'pos' | 'inventario'>('productos');

  useEffect(() => {
    async function loadData() {
      try {
        const [cats, prods] = await Promise.all([
          productService.getCategories(),
          productService.getProducts(),
        ]);
        setCategories(cats || []);
        setProducts(prods || []);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [refreshKey]);

  const handleRefresh = () => {
    setRefreshKey(k => k + 1);
    // Don't auto-switch view to keep user where they are
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC] text-slate-900 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0F172A] text-slate-300 flex flex-col shrink-0">
        <div className="p-6">
          <div className="flex items-center gap-3 text-white mb-8">
            <div className="p-1">
              <Store className="w-8 h-8 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-xl leading-none">PetStock</span>
              <span className="text-[10px] text-slate-400">Alimentos y Accesorios</span>
            </div>
          </div>
          
          <nav className="flex flex-col gap-1.5 mt-4">
            <button className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors w-full text-left">
              <Home className="w-5 h-5" />
              <span className="font-medium text-sm">Inicio</span>
            </button>
            <button 
              onClick={() => setCurrentView('productos')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full text-left ${currentView === 'productos' || currentView === 'nuevo_producto' ? 'bg-blue-500/10 text-blue-400 border-l-2 border-blue-500' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <Package className="w-5 h-5" />
              <span className="font-medium text-sm">Productos</span>
            </button>
            <button 
              onClick={() => setCurrentView('nueva_compra')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full text-left ${currentView === 'nueva_compra' ? 'bg-blue-500/10 text-blue-400 border-l-2 border-blue-500' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <ShoppingCart className="w-5 h-5" />
              <span className="font-medium text-sm">Compras</span>
            </button>
            <button 
              onClick={() => setCurrentView('pos')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full text-left ${currentView === 'pos' ? 'bg-blue-500/10 text-blue-400 border-l-2 border-blue-500' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <Store className="w-5 h-5" />
              <span className="font-medium text-sm">Punto de Venta</span>
            </button>
            <button 
              onClick={() => setCurrentView('inventario')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors w-full text-left ${currentView === 'inventario' ? 'bg-blue-500/10 text-blue-400 border-l-2 border-blue-500' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <Boxes className="w-5 h-5" />
              <span className="font-medium text-sm">Inventario</span>
            </button>
            <button className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors w-full text-left">
              <BarChart2 className="w-5 h-5" />
              <span className="font-medium text-sm">Reportes</span>
            </button>
          </nav>
        </div>
        <div className="mt-auto p-6">
          <button className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors w-full text-left">
            <Settings className="w-5 h-5" />
            <span className="font-medium text-sm">Configuración</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8 h-full">
        
        {currentView === 'productos' && (
          <div className="flex flex-col h-full">
            <header className="mb-6 flex justify-between items-end">
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Productos</h1>
              <button 
                onClick={() => setCurrentView('nuevo_producto')}
                className="bg-[#2563EB] hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-2 text-sm shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Nuevo producto
              </button>
            </header>

            <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Buscar por nombre, código o marca..." 
                    className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all w-80"
                  />
                </div>
                <div className="flex gap-3">
                  <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]">
                    <option>Todas las categorías</option>
                  </select>
                  <select className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]">
                    <option>Todos los estados</option>
                  </select>
                </div>
              </div>
              
              {loading ? (
                <div className="p-12 text-center text-slate-400 flex-1">Cargando catálogo...</div>
              ) : products.length === 0 ? (
                <div className="p-12 text-center text-slate-400 italic flex-1">No hay productos registrados.</div>
              ) : (
                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 text-xs font-semibold">
                        <th className="py-3 px-6 font-semibold">Código</th>
                        <th className="py-3 px-6 font-semibold">Producto</th>
                        <th className="py-3 px-6 font-semibold">Categoría</th>
                        <th className="py-3 px-6 font-semibold">Tipo</th>
                        <th className="py-3 px-6 font-semibold">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {products.map((p, idx) => (
                        <ProductDetail
                          key={p.id}
                          product={p}
                          categoryName={categories.find((c) => c.id === p.category_id)?.name || '-'}
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
          <div className="max-w-4xl mx-auto">
            <PurchaseForm onPurchaseAdded={handleRefresh} onCancel={() => setCurrentView('productos')} />
          </div>
        )}

        {currentView === 'nuevo_producto' && (
          <div className="max-w-2xl mx-auto">
            <ProductForm onProductAdded={handleRefresh} onCancel={() => setCurrentView('productos')} />
          </div>
        )}

        {currentView === 'pos' && (
          <div className="h-full max-w-5xl mx-auto">
            <PosForm onSaleComplete={handleRefresh} />
          </div>
        )}

        {currentView === 'inventario' && (
          <div className="h-full max-w-5xl mx-auto">
            <InventoryView products={products} />
          </div>
        )}

      </main>
    </div>
  );
}

export default App;
