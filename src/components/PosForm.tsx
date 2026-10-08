import React, { useState, useEffect, useMemo } from 'react';
import { productService } from '../services/productService';
import { saleService, saleCalculations } from '../services/saleService';
import { supabase } from '../lib/supabase';
import { ShoppingCart, Calculator, Trash2, Plus, ArrowLeft } from 'lucide-react';

export function PosForm({ onSaleComplete, onCancel }: { onSaleComplete?: () => void, onCancel?: () => void }) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Sale Items
  const [saleItems, setSaleItems] = useState<any[]>([]);
  
  // Current Item Input State
  const [productId, setProductId] = useState('');
  const [presentationId, setPresentationId] = useState('');
  const [saleMode, setSaleMode] = useState<'amount' | 'quantity'>('amount');
  
  const [inputValue, setInputValue] = useState('');
  
  useEffect(() => {
    productService.getProducts().then(data => setProducts(data || []));
  }, []);

  const selectedProduct = products.find(p => p.id === productId);
  const presentations = selectedProduct?.product_presentations || [];
  const selectedPresentation = presentations.find((p: any) => p.id === presentationId);
  
  // Use price_per_kg for weight-based products (fractional sales), fall back to price for unit sales
  const isWeightProduct = selectedProduct?.type === 'weight';
  const rawPrice = isWeightProduct
    ? (selectedPresentation?.price_per_kg ?? selectedPresentation?.price ?? 0)
    : (selectedPresentation?.price ?? 0);
  const effectivePrice = Number(rawPrice) || 0;
  const cost = Number(selectedPresentation?.cost) || 0;
  // Soft warning only — never blocks input
  const priceIsZero = !!selectedPresentation && effectivePrice === 0;
  
  // Real-time calculation based on input
  const calculated = useMemo(() => {
    if (!effectivePrice || !inputValue || isNaN(Number(inputValue))) {
      return { quantity: 0, amount: 0, profit: 0 };
    }
    const val = Number(inputValue);
    
    let q = 0;
    let a = 0;
    
    if (saleMode === 'amount') {
      a = val;
      q = saleCalculations.calculateQuantityByAmount(val, effectivePrice);
    } else {
      q = val;
      a = saleCalculations.calculateAmountByQuantity(val, effectivePrice);
    }
    
    const profit = saleCalculations.calculateGrossProfit(a, q, cost);
    return { quantity: q, amount: a, profit };
  }, [inputValue, saleMode, effectivePrice, cost]);

  const handleAddItem = () => {
    if (!productId || !presentationId || calculated.amount <= 0 || calculated.quantity <= 0) return;
    
    setSaleItems([...saleItems, {
      product_id: productId,
      presentation_id: presentationId,
      product_name: selectedProduct.name,
      presentation_name: selectedPresentation.name,
      quantity: calculated.quantity,
      unit_price: effectivePrice,
      subtotal: calculated.amount,
      cost: cost,
      profit: calculated.profit
    }]);
    
    // Reset current item
    setProductId('');
    setPresentationId('');
    setInputValue('');
  };

  const handleRemoveItem = (index: number) => {
    setSaleItems(saleItems.filter((_, i) => i !== index));
  };

  const totals = saleItems.reduce((acc, item) => ({
    amount: acc.amount + item.subtotal,
    cost: acc.cost + (item.quantity * item.cost),
    profit: acc.profit + item.profit
  }), { amount: 0, cost: 0, profit: 0 });

  const handleProcessSale = async () => {
    if (saleItems.length === 0) return;
    
    setLoading(true);
    try {
      await saleService.processSale(
        totals.amount,
        totals.cost,
        'Efectivo', // Hardcoded for now
        saleItems.map(i => ({
          product_id: i.product_id,
          presentation_id: i.presentation_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          subtotal: i.subtotal,
          cost: i.cost
        }))
      );
      
      setSaleItems([]);
      if (onSaleComplete) onSaleComplete();
      alert('Venta procesada exitosamente');
    } catch (error: any) {
      console.error(error);
      alert('Error al procesar la venta: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 w-full flex flex-col h-full">
      <div className="p-6 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onCancel && (
            <button onClick={onCancel} className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h2 className="text-xl font-bold text-slate-800">Punto de Venta</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 flex-1">
        {/* Panel Izquierdo: Selección */}
        <div className="lg:col-span-7 p-6 border-r border-slate-100 flex flex-col gap-6">
          
          <div className="bg-slate-50 p-1.5 rounded-lg inline-flex w-full">
            <button
              type="button"
              onClick={() => { setSaleMode('amount'); setInputValue(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${saleMode === 'amount' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Por Importe ($)
            </button>
            <button
              type="button"
              onClick={() => { setSaleMode('quantity'); setInputValue(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${saleMode === 'quantity' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Por Cantidad (Kg/Uds)
            </button>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Producto</label>
              <select 
                value={productId} onChange={e => { setProductId(e.target.value); setPresentationId(''); }}
                className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB] text-sm"
              >
                <option value="">Seleccionar...</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Presentación</label>
              <select 
                value={presentationId} onChange={e => setPresentationId(e.target.value)}
                disabled={!productId}
                className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB] text-sm disabled:bg-slate-50"
              >
                <option value="">Seleccionar...</option>
                {presentations.map((p: any) => {
                  const displayPrice = selectedProduct?.type === 'weight'
                    ? (p.price_per_kg || p.price)
                    : p.price;
                  return <option key={p.id} value={p.id}>{p.name} (${displayPrice}/kg)</option>;
                })}
              </select>
            </div>
          </div>

          <div className="bg-blue-50/50 p-6 rounded-xl border border-blue-100">
            <label className="block text-sm font-medium text-blue-900 mb-2">
              {saleMode === 'amount' ? 'Importe a cobrar ($)' : 'Cantidad a entregar (Kg/Uds)'}
            </label>

            {priceIsZero && (
              <div className="mb-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded-lg flex items-center gap-2" data-testid="price-zero-warning">
                <span>⚠</span>
                Precio de venta en $0. Configurá el precio en la presentación para que el cálculo sea correcto.
              </div>
            )}

            <div className="relative mb-4">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500 font-bold text-xl">
                {saleMode === 'amount' ? '$' : ''}
              </span>
              <input 
                type="number" step="0.01" min="0"
                value={inputValue} onChange={e => setInputValue(e.target.value)}
                data-testid="pos-input-value"
                className={`w-full p-4 ${saleMode === 'amount' ? 'pl-9' : 'pl-4'} text-2xl font-bold border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB] text-blue-900 bg-white`}
                placeholder="0.00"
              />
            </div>

            {inputValue && Number(inputValue) > 0 && selectedPresentation && (
              <div className="bg-white p-4 rounded-lg border border-blue-100 flex justify-between items-center shadow-sm" data-testid="pos-calculation-result">
                <div className="flex items-center gap-2 text-blue-700">
                  <Calculator className="w-5 h-5" />
                  <span className="font-medium text-sm">
                    {saleMode === 'amount' ? 'Cantidad a entregar:' : 'Importe a cobrar:'}
                  </span>
                </div>
                <span className="text-xl font-bold text-green-600" data-testid="pos-calculated-value">
                  {saleMode === 'amount' 
                    ? `${calculated.quantity.toLocaleString('es-AR', {minimumFractionDigits: 3})} kg` 
                    : `$${calculated.amount.toLocaleString('es-AR', {minimumFractionDigits: 2})}`}
                </span>
              </div>
            )}
          </div>

          <button 
            type="button"
            onClick={handleAddItem}
            disabled={!productId || !presentationId || !inputValue || calculated.amount <= 0}
            className="w-full bg-[#2563EB] hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Agregar al ticket
          </button>
        </div>

        {/* Panel Derecho: Ticket */}
        <div className="lg:col-span-5 bg-slate-50 p-6 flex flex-col border-l border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Ticket de Venta</h3>
          
          <div className="flex-1 overflow-y-auto mb-6">
            {saleItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3">
                <ShoppingCart className="w-12 h-12 text-slate-300" />
                <p>El ticket está vacío</p>
              </div>
            ) : (
              <div className="space-y-3">
                {saleItems.map((item, idx) => (
                  <div key={idx} className="bg-white p-3 rounded-lg border border-slate-200 flex justify-between items-start shadow-sm">
                    <div>
                      <div className="font-semibold text-slate-800 text-sm">{item.product_name}</div>
                      <div className="text-xs text-slate-500 mb-1">{item.presentation_name} • ${item.unit_price}/kg</div>
                      <div className="text-xs font-medium text-blue-600">{item.quantity} kg</div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="font-bold text-slate-800">${item.subtotal.toFixed(2)}</div>
                      <button onClick={() => handleRemoveItem(idx)} className="text-slate-400 hover:text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex justify-between text-slate-500 text-sm">
              <span>Subtotal</span>
              <span>${totals.amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-green-600 text-sm font-medium">
              <span>Ganancia Bruta</span>
              <span>${totals.profit.toFixed(2)}</span>
            </div>
            <div className="border-t border-slate-100 pt-3 flex justify-between items-center">
              <span className="text-lg font-medium text-slate-800">Total a cobrar</span>
              <span className="text-3xl font-bold text-[#10B981]">${totals.amount.toFixed(2)}</span>
            </div>
          </div>

          <button 
            onClick={handleProcessSale}
            disabled={saleItems.length === 0 || loading}
            className="mt-4 w-full bg-[#10B981] hover:bg-[#059669] text-white font-bold py-4 px-4 rounded-xl transition-colors disabled:opacity-50 text-lg shadow-sm"
          >
            {loading ? 'Procesando...' : 'Cobrar Ticket'}
          </button>
        </div>
      </div>
    </div>
  );
}
