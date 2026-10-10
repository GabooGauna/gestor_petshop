import React, { useState, useEffect } from 'react';
import { purchaseService } from '../services/purchases';
import { productService } from '../services/productService';
import { supplierService } from '../services/supplierService';
import { SupplierModal } from './SupplierModal';
import type { Database } from '../types/database.types';
import {
  ArrowLeft, Trash2, Plus, Truck, AlertCircle,
  Layers, Package, FileText, CheckCircle, X
} from 'lucide-react';

type Supplier = Database['public']['Tables']['suppliers']['Row'];
type Category = Database['public']['Tables']['categories']['Row'];

interface Presentation {
  id: string;
  name: string;
  price: number;
  price_per_kg: number | null;
  cost: number;
  stock: number;
  weight_kg: number | null;
}

interface Product {
  id: string;
  name: string;
  type: string | null;
  status: string | null;
  category_id: string | null;
  product_presentations: Presentation[];
}

interface PurchaseItemRow {
  tempId: string;
  productId: string;
  presentationId: string;
  quantity: string;
  unitCost: string;
  // Campos auxiliares si es una nueva presentación creada al vuelo
  isNewPresentation?: boolean;
  newPresName?: string;
  newPresWeightKg?: string;
  newPresSalePrice?: string;
  newPresMargenPct?: string;
}

interface PurchaseFormProps {
  onPurchaseAdded: () => void;
  onCancel?: () => void;
}

function calcPricePerKg(priceBulk: number, weightKg: number, margenPct: number): number {
  if (!priceBulk || !weightKg) return 0;
  return (priceBulk / weightKg) * (1 + margenPct / 100);
}

function isValidMoneyInput(input: string): boolean {
  return /^[0-9]+(?:\.[0-9]{1,2})?$/.test(input) && Number(input) > 0;
}

function normalizeMoney(input: string): `${number}` {
  const [whole, fraction = ''] = input.split('.');
  return `${whole}.${fraction.padEnd(2, '0')}` as `${number}`;
}

export function PurchaseForm({ onPurchaseAdded, onCancel }: PurchaseFormProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [supplierId, setSupplierId] = useState('');
  const [invoice, setInvoice] = useState('');

  // Ítems de la compra
  const [items, setItems] = useState<PurchaseItemRow[]>([
    { tempId: 'item-1', productId: '', presentationId: '', quantity: '', unitCost: '' },
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modales y creadores rápidos
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [showQuickSupplier, setShowQuickSupplier] = useState(false);
  const [quickSuppName, setQuickSuppName] = useState('');
  const [quickSuppContact, setQuickSuppContact] = useState('');
  const [creatingQuickSupp, setCreatingQuickSupp] = useState(false);

  // Modal para crear producto nuevo desde la compra
  const [showNewProductModal, setShowNewProductModal] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdCatId, setNewProdCatId] = useState('');
  const [newProdType, setNewProdType] = useState<'weight' | 'unit'>('weight');
  const [newProdPresName, setNewProdPresName] = useState('Bolsa 20kg');
  const [newProdWeight, setNewProdWeight] = useState('20');
  const [newProdCost, setNewProdCost] = useState('');
  const [newProdPrice, setNewProdPrice] = useState('');
  const [newProdMargen, setNewProdMargen] = useState('10');
  const [savingNewProduct, setSavingNewProduct] = useState(false);

  // Modal para nueva presentación rápida
  const [quickPresRowIndex, setQuickPresRowIndex] = useState<number | null>(null);
  const [quickPresName, setQuickPresName] = useState('');
  const [quickPresWeight, setQuickPresWeight] = useState('');
  const [quickPresCost, setQuickPresCost] = useState('');
  const [quickPresPrice, setQuickPresPrice] = useState('');
  const [quickPresMargen] = useState('10');
  const [savingQuickPres, setSavingQuickPres] = useState(false);

  const loadInitialData = async () => {
    try {
      const [suppData, prodData, catData] = await Promise.all([
        supplierService.getSuppliers(),
        productService.getProducts(),
        productService.getCategories(),
      ]);
      setSuppliers(suppData);
      setProducts(((prodData ?? []) as Product[]).filter(product => product.status === 'active'));
      setCategories(catData);
    } catch (err) {
      console.error('Error al cargar datos:', err);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadInitialData();
  }, []);

  // Crear proveedor rápido inline
  const handleCreateQuickSupplier = async () => {
    const trimmed = quickSuppName.trim();
    if (!trimmed) return;
    setCreatingQuickSupp(true);
    try {
      const created = await supplierService.createSupplier({
        name: trimmed,
        contact_info: quickSuppContact.trim() || undefined,
      });
      setSuppliers(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSupplierId(created.id);
      setQuickSuppName('');
      setQuickSuppContact('');
      setShowQuickSupplier(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al crear proveedor.');
    } finally {
      setCreatingQuickSupp(false);
    }
  };

  // Crear producto nuevo directamente desde la compra
  const handleSaveNewProductFromPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim() || !newProdCatId) return;

    setSavingNewProduct(true);
    try {
      const weightNum = newProdType === 'weight' ? Number(newProdWeight) || 0 : null;
      const costNum = Number(newProdCost) || 0;
      const priceNum = Number(newProdPrice) || 0;
      const calculatedPricePerKg = newProdType === 'weight' && weightNum && priceNum
        ? calcPricePerKg(priceNum, weightNum, Number(newProdMargen) || 0)
        : null;

      const created = await productService.createProductWithPresentation({
        product: {
          name: newProdName.trim(),
          category_id: newProdCatId,
          type: newProdType,
        },
        presentation: {
          name: newProdPresName.trim() || (newProdType === 'weight' ? 'Bolsa' : 'Unidad'),
          weight_kg: weightNum,
          cost: costNum,
          price: priceNum,
          price_per_kg: calculatedPricePerKg,
        },
      });

      // Recargar productos
      const updatedProducts = ((await productService.getProducts()) as Product[]).filter(product => product.status === 'active');
      setProducts(updatedProducts);

      const createdFull = updatedProducts.find(p => p.id === created.id);
      const firstPres = createdFull?.product_presentations[0];

      // Insertar o actualizar la última fila con este nuevo producto
      setItems(prev => {
        const last = prev[prev.length - 1];
        if (last && !last.productId) {
          return prev.map((item, idx) =>
            idx === prev.length - 1
              ? {
                  ...item,
                  productId: created.id,
                  presentationId: firstPres?.id || '',
                  unitCost: costNum > 0 ? String(costNum) : item.unitCost,
                }
              : item
          );
        }
        return [
          ...prev,
          {
            tempId: `item-${Date.now()}`,
            productId: created.id,
            presentationId: firstPres?.id || '',
            quantity: '1',
            unitCost: costNum > 0 ? String(costNum) : '',
          },
        ];
      });

      setShowNewProductModal(false);
      setNewProdName('');
      setNewProdCost('');
      setNewProdPrice('');
    } catch (err: unknown) {
      alert('Error al crear producto: ' + (err instanceof Error ? err.message : ''));
    } finally {
      setSavingNewProduct(false);
    }
  };

  // Crear nueva presentación para un producto existente desde la fila de compra
  const handleSaveQuickPresentation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quickPresRowIndex == null || !quickPresName.trim()) return;

    const row = items[quickPresRowIndex];
    const targetProduct = products.find(p => p.id === row.productId);
    if (!targetProduct) return;

    setSavingQuickPres(true);
    try {
      const isWeight = targetProduct.type === 'weight';
      const weightNum = isWeight ? Number(quickPresWeight) || 0 : null;
      const costNum = Number(quickPresCost) || 0;
      const priceNum = Number(quickPresPrice) || 0;
      const pricePerKgCalc = isWeight && weightNum && priceNum
        ? calcPricePerKg(priceNum, weightNum, Number(quickPresMargen) || 0)
        : null;

      const createdPres = await productService.createPresentation({
        product_id: targetProduct.id,
        name: quickPresName.trim(),
        weight_kg: weightNum,
        cost: costNum,
        price: priceNum,
        price_per_kg: pricePerKgCalc,
      });

      // Recargar productos
      const updatedProducts = ((await productService.getProducts()) as Product[]).filter(product => product.status === 'active');
      setProducts(updatedProducts);

      // Asignar a la fila
      updateItem(quickPresRowIndex, 'presentationId', createdPres.id);
      if (costNum > 0) {
        updateItem(quickPresRowIndex, 'unitCost', String(costNum));
      }

      setQuickPresRowIndex(null);
      setQuickPresName('');
      setQuickPresWeight('');
      setQuickPresCost('');
      setQuickPresPrice('');
    } catch (err: unknown) {
      alert('Error al crear presentación: ' + (err instanceof Error ? err.message : ''));
    } finally {
      setSavingQuickPres(false);
    }
  };

  const updateItem = (index: number, field: keyof PurchaseItemRow, value: string) => {
    setItems(prev =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, [field]: value };
        if (field === 'productId') {
          // Resetear presentación y auto-seleccionar la primera si existe
          const prod = products.find(p => p.id === value);
          const firstPres = prod?.product_presentations[0];
          updated.presentationId = firstPres?.id || '';
          if (firstPres && firstPres.cost > 0) {
            updated.unitCost = String(firstPres.cost);
          }
        }
        if (field === 'presentationId') {
          const prod = products.find(p => p.id === item.productId);
          const pres = prod?.product_presentations.find(pr => pr.id === value);
          if (pres && pres.cost > 0 && !item.unitCost) {
            updated.unitCost = String(pres.cost);
          }
        }
        return updated;
      })
    );
  };

  const addItemRow = () => {
    setItems(prev => [
      ...prev,
      { tempId: `item-${Date.now()}`, productId: '', presentationId: '', quantity: '', unitCost: '' },
    ]);
  };

  const removeItemRow = (index: number) => {
    if (items.length === 1) {
      setItems([{ tempId: 'item-1', productId: '', presentationId: '', quantity: '', unitCost: '' }]);
      return;
    }
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  // Cálculo del total acumulado de la compra
  const totalAmount = items.reduce((sum, item) => {
    const qty = parseFloat(item.quantity) || 0;
    const cost = parseFloat(item.unitCost) || 0;
    return sum + qty * cost;
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!supplierId) {
      setError('Seleccioná un proveedor para la compra.');
      return;
    }

    const validItems = items.filter(it => it.productId || it.presentationId || it.quantity || it.unitCost);

    if (validItems.length === 0) {
      setError('Agregá al menos un ítem con producto, presentación, cantidad y costo.');
      return;
    }
    const hasInvalidItem = validItems.some(it => {
      const quantity = Number(it.quantity);
      const unitCost = Number(it.unitCost);
      return !it.productId || !it.presentationId || !Number.isFinite(quantity) || !Number.isInteger(quantity)
        || quantity <= 0 || !Number.isFinite(unitCost) || !isValidMoneyInput(it.unitCost);
    });
    if (hasInvalidItem) {
      setError('Cada ítem debe tener presentación, una cantidad entera positiva y un costo mayor a cero.');
      return;
    }

    setLoading(true);
    try {
      const payloadItems = validItems.map(it => ({
        presentation_id: it.presentationId,
        quantity: String(Number(it.quantity)) as `${number}`,
        unit_cost: normalizeMoney(it.unitCost),
      }));

      await purchaseService.processPurchase(
        supplierId,
        invoice.trim() || `FC-${Date.now().toString().slice(-6)}`,
        payloadItems
      );

      onPurchaseAdded();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al registrar la compra.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 w-full" data-testid="purchase-form-container">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Registrar Compra</h2>
            <p className="text-xs text-slate-500">Ingreso de stock y actualización al último costo</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 p-4 sm:p-6">
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Proveedor y Factura */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Proveedor */}
          <div className="md:col-span-2">
            <div className="mb-1.5 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Proveedor <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {!showQuickSupplier ? (
                  <button
                    type="button"
                    onClick={() => setShowQuickSupplier(true)}
                    className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1 transition-colors"
                    data-testid="btn-add-quick-supplier"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Nuevo proveedor
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setShowQuickSupplier(false); setQuickSuppName(''); }}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsSupplierModalOpen(true)}
                  className="text-xs text-slate-500 hover:text-slate-700 font-medium flex items-center gap-1 transition-colors pl-2 border-l border-slate-200"
                  data-testid="btn-open-supplier-modal"
                >
                  <Truck className="w-3.5 h-3.5 text-emerald-600" />
                  Gestionar
                </button>
              </div>
            </div>

            {showQuickSupplier && (
              <div className="p-3 mb-2 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-2 animate-fadeIn">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    value={quickSuppName}
                    onChange={e => setQuickSuppName(e.target.value)}
                    placeholder="Nombre del proveedor..."
                    className="p-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                    data-testid="quick-supplier-name-input"
                    autoFocus
                  />
                  <input
                    type="text"
                    value={quickSuppContact}
                    onChange={e => setQuickSuppContact(e.target.value)}
                    placeholder="Teléfono o email (opcional)..."
                    className="p-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                    data-testid="quick-supplier-contact-input"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={creatingQuickSupp || !quickSuppName.trim()}
                    onClick={() => void handleCreateQuickSupplier()}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium disabled:opacity-50 transition-colors shadow-sm"
                    data-testid="save-quick-supplier-btn"
                  >
                    {creatingQuickSupp ? 'Guardando...' : 'Guardar proveedor'}
                  </button>
                </div>
              </div>
            )}

            <select
              required
              value={supplierId}
              onChange={e => setSupplierId(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm bg-white"
              data-testid="purchase-supplier-select"
            >
              <option value="">Seleccione proveedor...</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.contact_info ? `(${s.contact_info})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Factura y Fecha */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              N° Comprobante / Factura
            </label>
            <div className="relative">
              <FileText className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={invoice}
                onChange={e => setInvoice(e.target.value)}
                placeholder="Ej: A-0001-00045892"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                data-testid="purchase-invoice-input"
              />
            </div>
          </div>
        </div>

        {/* Tabla de Artículos a Comprar */}
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
          <div className="flex flex-col items-start gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-600" />
              Artículos de la Compra ({items.length})
            </span>
            <button
              type="button"
              onClick={() => setShowNewProductModal(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-[#2563EB] shadow-2xs transition-colors hover:bg-blue-50/50 hover:text-blue-700 sm:w-auto sm:py-1.5"
              data-testid="btn-create-product-from-purchase"
            >
              <Plus className="w-3.5 h-3.5" />
              Nuevo producto en local
            </button>
          </div>

          <div className="lg:overflow-x-auto">
            <table className="block w-full border-collapse text-left text-sm lg:table lg:table-fixed">
              <colgroup className="hidden lg:table-column-group">
                <col className="w-[31%]" />
                <col className="w-[31%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
                <col className="w-[11%]" />
                <col className="w-[5%]" />
              </colgroup>
              <thead className="hidden border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500 lg:table-header-group">
                <tr>
                  <th className="py-2.5 px-4">Producto</th>
                  <th className="py-2.5 px-4">Presentación</th>
                  <th className="px-3 py-2.5">Cantidad</th>
                  <th className="px-3 py-2.5">Costo Unit. ($)</th>
                  <th className="px-3 py-2.5 text-right">Subtotal</th>
                  <th className="px-2 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="block space-y-3 bg-slate-50/60 p-3 lg:table-row-group lg:space-y-0 lg:bg-white lg:p-0">
                {items.map((row, idx) => {
                  const prod = products.find(p => p.id === row.productId);
                  const presentations = prod?.product_presentations || [];
                  const isWeight = prod?.type === 'weight';
                  const rowSubtotal = (parseFloat(row.quantity) || 0) * (parseFloat(row.unitCost) || 0);

                  return (
                    <tr key={row.tempId} className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50/50 lg:table-row lg:rounded-none lg:border-0 lg:p-0 lg:shadow-none">
                      {/* Producto */}
                      <td className="col-span-2 p-0 lg:table-cell lg:p-3">
                        <span className="mb-1.5 block text-xs font-medium text-slate-500 lg:hidden">Producto</span>
                        <select
                          required
                          value={row.productId}
                          onChange={e => updateItem(idx, 'productId', e.target.value)}
                          className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm bg-white"
                          data-testid={`purchase-item-product-${idx}`}
                        >
                          <option value="">Seleccione producto...</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Presentación con opción de crear nueva */}
                      <td className="col-span-2 p-0 lg:table-cell lg:p-3">
                        <span className="mb-1.5 block text-xs font-medium text-slate-500 lg:hidden">Presentación</span>
                        <div className="flex items-center gap-1.5">
                          <select
                            required
                            value={row.presentationId}
                            onChange={e => updateItem(idx, 'presentationId', e.target.value)}
                            disabled={!row.productId}
                            className="flex-1 p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-400 text-sm bg-white"
                            data-testid={`purchase-item-presentation-${idx}`}
                          >
                            <option value="">Seleccione...</option>
                            {presentations.map(pr => (
                              <option key={pr.id} value={pr.id}>
                                {pr.name} (stock: {pr.stock} {isWeight ? 'kg' : 'u'})
                              </option>
                            ))}
                          </select>
                          {row.productId && (
                            <button
                              type="button"
                              onClick={() => {
                                setQuickPresRowIndex(idx);
                                setQuickPresName(isWeight ? 'Bolsa 15kg' : 'Unidad');
                                setQuickPresWeight(isWeight ? '15' : '');
                              }}
                              className="p-2 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg border border-emerald-200 transition-colors shrink-0"
                              title="Crear nueva presentación para este producto"
                              data-testid={`btn-quick-presentation-${idx}`}
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Cantidad */}
                      <td className="p-0 lg:table-cell lg:p-3">
                        <span className="mb-1.5 block text-xs font-medium text-slate-500 lg:hidden">Cantidad</span>
                        <input
                          required
                          type="number"
                          step={isWeight ? '0.001' : '1'}
                          min={isWeight ? '0.001' : '1'}
                          value={row.quantity}
                          onChange={e => updateItem(idx, 'quantity', e.target.value)}
                          placeholder={isWeight ? '10 kg' : '10 u'}
                          className="w-full p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-mono"
                          data-testid={`purchase-item-quantity-${idx}`}
                        />
                      </td>

                      {/* Costo Unitario */}
                      <td className="p-0 lg:table-cell lg:p-3">
                        <span className="mb-1.5 block text-xs font-medium text-slate-500 lg:hidden">Costo unitario</span>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                          <input
                            required
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.unitCost}
                            onChange={e => updateItem(idx, 'unitCost', e.target.value)}
                            placeholder="0.00"
                            className="w-full pl-6 pr-2 p-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-mono"
                            data-testid={`purchase-item-cost-${idx}`}
                          />
                        </div>
                      </td>

                      {/* Subtotal */}
                      <td className="flex flex-col justify-end p-0 font-mono font-semibold text-slate-800 lg:table-cell lg:p-3 lg:text-right">
                        <span className="mb-1 block font-sans text-xs font-medium text-slate-500 lg:hidden">Subtotal</span>
                        <span>${rowSubtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                      </td>

                      {/* Eliminar */}
                      <td className="flex items-end justify-end p-0 lg:table-cell lg:p-3 lg:text-center">
                        <button
                          type="button"
                          onClick={() => removeItemRow(idx)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Quitar fila"
                          data-testid={`remove-purchase-item-${idx}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-center border-t border-slate-200 bg-slate-50/50 p-3 sm:justify-start">
            <button
              type="button"
              onClick={addItemRow}
              className="text-emerald-700 hover:text-emerald-800 font-semibold text-xs flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors"
              data-testid="btn-add-purchase-row"
            >
              <Plus className="w-3.5 h-3.5" />
              Agregar otra fila
            </button>
          </div>
        </div>

        {/* Total General */}
        <div className="flex justify-end pt-2">
          <div className="flex w-full flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 shadow-2xs sm:w-auto sm:flex-row sm:items-center sm:gap-6 sm:px-6">
            <span className="text-slate-600 font-semibold text-sm">Total de la Factura:</span>
            <span className="text-2xl font-bold text-slate-800 font-mono" data-testid="purchase-total-amount">
              ${totalAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="w-full rounded-lg border border-slate-300 px-6 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 sm:w-auto"
          >
            Cancelar
          </button>
          <button
            disabled={loading || totalAmount <= 0}
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
            data-testid="submit-purchase-btn"
          >
            <CheckCircle className="w-4 h-4" />
            {loading ? 'Procesando compra...' : 'Confirmar Compra'}
          </button>
        </div>
      </form>

      {/* Modal: Administrar Proveedores */}
      <SupplierModal
        isOpen={isSupplierModalOpen}
        onClose={() => setIsSupplierModalOpen(false)}
        suppliers={suppliers}
        onSupplierChanged={loadInitialData}
      />

      {/* Modal: Crear Producto Nuevo desde Compras */}
      {showNewProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-sm animate-fadeIn sm:p-4">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl" role="dialog" aria-modal="true" aria-labelledby="purchase-product-modal-title">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-4 py-4 sm:px-6">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-[#2563EB] rounded-lg">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="purchase-product-modal-title" className="text-base font-bold text-slate-800">Nuevo Producto en Local</h3>
                  <p className="text-xs text-slate-500">Cargalo una sola vez y sumalo a la compra</p>
                </div>
              </div>
              <button
                onClick={() => setShowNewProductModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
                aria-label="Cerrar nuevo producto"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNewProductFromPurchase} className="flex flex-col gap-4 overflow-y-auto p-4 sm:p-6">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre del producto *</label>
                <input
                  required
                  type="text"
                  value={newProdName}
                  onChange={e => setNewProdName(e.target.value)}
                  placeholder="Ej: Cat Chow Gatitos"
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-[#2563EB]"
                  data-testid="purchase-new-prod-name"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Categoría *</label>
                  <select
                    required
                    value={newProdCatId}
                    onChange={e => setNewProdCatId(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-[#2563EB]"
                    data-testid="purchase-new-prod-cat"
                  >
                    <option value="">Seleccione...</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de venta *</label>
                  <select
                    value={newProdType}
                    onChange={e => setNewProdType(e.target.value as 'weight' | 'unit')}
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-[#2563EB]"
                  >
                    <option value="weight">Por Peso (Kg)</option>
                    <option value="unit">Por Unidad</option>
                  </select>
                </div>
              </div>

              {/* Presentación inicial */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Presentación y Precios Sugeridos
                </span>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Presentación</label>
                    <input
                      type="text"
                      value={newProdPresName}
                      onChange={e => setNewProdPresName(e.target.value)}
                      placeholder={newProdType === 'weight' ? 'Bolsa 20kg' : 'Unidad'}
                      className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white"
                    />
                  </div>

                  {newProdType === 'weight' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Peso (kg)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={newProdWeight}
                        onChange={e => setNewProdWeight(e.target.value)}
                        placeholder="20"
                        className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Costo de compra ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newProdCost}
                      onChange={e => setNewProdCost(e.target.value)}
                      placeholder="0.00"
                      className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Precio venta al público ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newProdPrice}
                      onChange={e => setNewProdPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white"
                    />
                  </div>
                </div>

                {newProdType === 'weight' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Margen adicional venta suelta (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={newProdMargen}
                      onChange={e => setNewProdMargen(e.target.value)}
                      className="w-24 p-1.5 border border-slate-200 rounded-lg text-sm bg-white"
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowNewProductModal(false)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:w-auto"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingNewProduct || !newProdName.trim() || !newProdCatId}
                  className="w-full rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50 sm:w-auto"
                  data-testid="purchase-confirm-new-prod-btn"
                >
                  {savingNewProduct ? 'Creando...' : 'Crear y sumar a compra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Crear Nueva Presentación Rápida para Fila Existente */}
      {quickPresRowIndex != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-sm animate-fadeIn sm:p-4">
          <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl" role="dialog" aria-modal="true" aria-labelledby="purchase-presentation-modal-title">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-4 py-4 sm:px-6">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="purchase-presentation-modal-title" className="text-base font-bold text-slate-800">Nueva Presentación</h3>
                  <p className="text-xs text-slate-500">
                    Para {products.find(p => p.id === items[quickPresRowIndex]?.productId)?.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setQuickPresRowIndex(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
                aria-label="Cerrar nueva presentación"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickPresentation} className="flex flex-col gap-4 overflow-y-auto p-4 sm:p-6">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre presentación *</label>
                <input
                  required
                  type="text"
                  value={quickPresName}
                  onChange={e => setQuickPresName(e.target.value)}
                  placeholder="Ej: Bolsa 15kg"
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                  data-testid="modal-quick-pres-name"
                />
              </div>

              {products.find(p => p.id === items[quickPresRowIndex]?.productId)?.type === 'weight' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Peso en kg *</label>
                  <input
                    required
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={quickPresWeight}
                    onChange={e => setQuickPresWeight(e.target.value)}
                    placeholder="15"
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                    data-testid="modal-quick-pres-weight"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Costo compra ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={quickPresCost}
                    onChange={e => setQuickPresCost(e.target.value)}
                    placeholder="0.00"
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white"
                    data-testid="modal-quick-pres-cost"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Precio venta ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={quickPresPrice}
                    onChange={e => setQuickPresPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white"
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setQuickPresRowIndex(null)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:w-auto"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingQuickPres || !quickPresName.trim()}
                  className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
                  data-testid="modal-confirm-quick-pres-btn"
                >
                  {savingQuickPres ? 'Creando...' : 'Crear y seleccionar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
