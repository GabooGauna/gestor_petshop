import React, { useState } from 'react';
import { productService } from '../services/productService';
import type { Database } from '../types/database.types';
import { X, Plus, FolderPlus, Trash2, Tag, Check, AlertCircle } from 'lucide-react';

type Category = Database['public']['Tables']['categories']['Row'];

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onCategoryChanged: () => void;
}

export function CategoryModal({ isOpen, onClose, categories, onCategoryChanged }: CategoryModalProps) {
  const [newCatName, setNewCatName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmed = newCatName.trim();
    if (!trimmed) {
      setError('Ingresá el nombre de la categoría.');
      return;
    }

    if (categories.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
      setError('Ya existe una categoría con ese nombre.');
      return;
    }

    setLoading(true);
    try {
      await productService.createCategory(trimmed);
      setNewCatName('');
      setSuccess(`Categoría "${trimmed}" creada correctamente.`);
      onCategoryChanged();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al crear la categoría.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar la categoría "${name}"? Los productos vinculados quedarán sin categoría.`)) {
      return;
    }
    setDeletingId(id);
    setError(null);
    try {
      await productService.deleteCategory(id);
      onCategoryChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al eliminar la categoría.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-sm animate-fadeIn sm:p-4">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl" role="dialog" aria-modal="true" aria-labelledby="category-modal-title">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 text-[#2563EB] rounded-lg">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 id="category-modal-title" className="text-base font-bold text-slate-800">Administrar Categorías</h3>
              <p className="text-xs text-slate-500">Creá y organizá las categorías de productos</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            data-testid="close-category-modal"
            aria-label="Cerrar categorías"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-5 overflow-y-auto p-4 sm:p-6">
          {/* Create form */}
          <form onSubmit={handleCreate} className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Nueva categoría
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Tag className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  placeholder="Ej: Alimento para perros, Juguetes, Farmacia..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all"
                  data-testid="new-category-name-input"
                  disabled={loading}
                />
              </div>
              <button
                type="submit"
                disabled={loading || !newCatName.trim()}
                className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
                data-testid="save-category-btn"
              >
                <Plus className="w-4 h-4" />
                {loading ? 'Creando...' : 'Crear'}
              </button>
            </div>
          </form>

          {/* Feedback banners */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-xs">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2.5 text-xs">
              <Check className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Categories List */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wide pt-2 border-t border-slate-100">
              <span>Categorías registradas</span>
              <span className="font-normal text-slate-400 font-mono">({categories.length})</span>
            </div>

            {categories.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No hay categorías creadas aún. Creá la primera arriba.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto pr-1">
                {categories.map(cat => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200/70 transition-colors group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Tag className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                      <span className="text-sm text-slate-700 font-medium truncate">{cat.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(cat.id, cat.name)}
                      disabled={deletingId === cat.id}
                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors opacity-60 group-hover:opacity-100 disabled:opacity-30"
                      title="Eliminar categoría"
                      data-testid={`delete-category-${cat.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-slate-100 bg-slate-50/50 px-4 py-3.5 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-white sm:w-auto"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
