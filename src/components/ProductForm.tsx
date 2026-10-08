import React, { useState, useEffect } from 'react';
import { productService } from '../services/productService';
import { ArrowLeft } from 'lucide-react';

export function ProductForm({ onProductAdded, onCancel }: { onProductAdded: () => void, onCancel?: () => void }) {
  const [categories, setCategories] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [type, setType] = useState('weight');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    productService.getCategories().then((data) => setCategories(data || []));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !categoryId) return;
    setLoading(true);
    try {
      await productService.createProduct({
        name,
        category_id: categoryId,
        type
      });
      setName('');
      onProductAdded();
    } catch (error) {
      console.error(error);
      alert('Error al crear producto');
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
        <h2 className="text-xl font-bold text-slate-800">Nuevo Producto</h2>
      </div>

      <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre</label>
          <input 
            required 
            type="text" 
            value={name} 
            onChange={e => setName(e.target.value)} 
            className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all text-sm"
            placeholder="Ej: Dog Chow Adultos"
          />
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Categoría</label>
            <select 
              required
              value={categoryId} 
              onChange={e => setCategoryId(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all text-sm"
            >
              <option value="">Seleccione una categoría</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Tipo Venta</label>
            <select 
              value={type} 
              onChange={e => setType(e.target.value)}
              className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all text-sm"
            >
              <option value="weight">Por Peso (Kg)</option>
              <option value="unit">Por Unidad</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 mt-2">
          <button 
            type="button" onClick={onCancel}
            className="px-6 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button 
            disabled={loading} type="submit" 
            className="bg-[#2563EB] hover:bg-blue-700 text-white font-medium py-2.5 px-6 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Guardando...' : 'Guardar producto'}
          </button>
        </div>
      </form>
    </div>
  );
}
