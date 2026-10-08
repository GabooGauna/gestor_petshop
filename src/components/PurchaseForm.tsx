import React, { useState, useEffect } from 'react';
import { purchaseService } from '../services/purchases';
import { productService } from '../services/productService';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Trash2, Plus } from 'lucide-react';

export function PurchaseForm({ onPurchaseAdded, onCancel }: { onPurchaseAdded: () => void, onCancel?: () => void }) {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  
  const [supplierId, setSupplierId] = useState('');
  const [invoice, setInvoice] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [productId, setProductId] = useState('');
  const [presentationId, setPresentationId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const [suppData, prodData] = await Promise.all([
        supabase.from('suppliers').select('*').order('name'),
        productService.getProducts()
      ]);
      setSuppliers(suppData.data || []);
      setProducts(prodData || []);
    }
    load();
  }, []);

  const selectedProduct = products.find(p => p.id === productId);
  const presentations = selectedProduct?.product_presentations || [];
  
  // Para la simulación de una tabla de productos a agregar, lo haremos simple aquí 
  // o solo procesaremos un item de momento (como estaba implementado) pero con layout visual de tabla
  const calculatedTotal = quantity && unitCost ? parseFloat(quantity) * parseFloat(unitCost) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId || !presentationId || !quantity || !unitCost) return;
    
    setLoading(true);
    try {
      const qty = parseFloat(quantity);
      const cost = parseFloat(unitCost);
      const subtotal = qty * cost;

      await purchaseService.processPurchase(
        supplierId,
        subtotal,
        invoice || `INV-${Date.now().toString().slice(-4)}`, // Fallback si no hay factura
        [{
          product_id: productId,
          presentation_id: presentationId,
          quantity: qty,
          unit_cost: cost,
          subtotal: subtotal
        }]
      );
      
      setProductId('');
      setPresentationId('');
      setQuantity('');
      setUnitCost('');
      setInvoice('');
      onPurchaseAdded();
    } catch (error) {
      console.error(error);
      alert('Error al registrar compra');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 w-full">
      <div className="p-6 border-b border-slate-100 flex items-center gap-3">
        <button onClick={onCancel} className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-slate-800">Registrar compra</h2>
      </div>

      <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-8">
        
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Proveedor</label>
            <select 
              required value={supplierId} onChange={e => setSupplierId(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#10B981] focus:border-transparent transition-all text-sm"
            >
              <option value="">Seleccione proveedor</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Fecha</label>
            <input 
              type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#10B981] focus:border-transparent transition-all text-sm text-slate-600"
            />
          </div>
        </div>

        <div>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-medium">Producto</th>
                  <th className="py-3 px-4 font-medium">Presentación</th>
                  <th className="py-3 px-4 font-medium w-32">Cantidad</th>
                  <th className="py-3 px-4 font-medium w-32">Costo unitario</th>
                  <th className="py-3 px-4 font-medium text-right w-32">Total</th>
                  <th className="py-3 px-4 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="p-2">
                    <select 
                      required value={productId} onChange={e => setProductId(e.target.value)}
                      className="w-full p-2 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#10B981] text-sm"
                    >
                      <option value="">Seleccione...</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                  <td className="p-2">
                    <select 
                      required value={presentationId} onChange={e => setPresentationId(e.target.value)}
                      disabled={!productId}
                      className="w-full p-2 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#10B981] disabled:bg-slate-50 text-sm"
                    >
                      <option value="">Seleccione...</option>
                      {presentations.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                  <td className="p-2">
                    <input 
                      required type="number" step="0.01" value={quantity} onChange={e => setQuantity(e.target.value)}
                      className="w-full p-2 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#10B981] text-sm"
                      placeholder="Ej: 10"
                    />
                  </td>
                  <td className="p-2">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                      <input 
                        required type="number" step="0.01" value={unitCost} onChange={e => setUnitCost(e.target.value)}
                        className="w-full p-2 pl-6 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#10B981] text-sm"
                        placeholder="0.00"
                      />
                    </div>
                  </td>
                  <td className="p-2 text-right font-medium text-slate-800">
                    ${calculatedTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="p-2 text-center">
                    <button type="button" className="text-red-400 hover:text-red-600 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="p-3 bg-white border-t border-slate-100">
              <button type="button" className="text-[#2563EB] hover:text-blue-700 font-medium text-sm flex items-center gap-1.5 transition-colors">
                <Plus className="w-4 h-4" />
                Agregar producto
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <div className="flex items-center gap-6">
            <span className="text-slate-600 font-medium">Total de la compra</span>
            <span className="text-2xl font-bold text-slate-800">${calculatedTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <button 
            type="button" onClick={onCancel}
            className="px-6 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button 
            disabled={loading} type="submit" 
            className="bg-[#10B981] hover:bg-[#059669] text-white font-medium py-2.5 px-6 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Procesando...' : 'Confirmar compra'}
          </button>
        </div>
      </form>
    </div>
  );
}
