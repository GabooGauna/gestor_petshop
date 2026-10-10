import React, { useState } from 'react';
import { supplierService } from '../services/supplierService';
import type { Database } from '../types/database.types';
import { X, Plus, Truck, Check, AlertCircle, Phone, Building2 } from 'lucide-react';

type Supplier = Database['public']['Tables']['suppliers']['Row'];

interface SupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  onSupplierChanged: () => void;
}

export function SupplierModal({ isOpen, onClose, suppliers, onSupplierChanged }: SupplierModalProps) {
  const [name, setName] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Ingresá el nombre del proveedor.');
      return;
    }

    setLoading(true);
    try {
      await supplierService.createSupplier({
        name: trimmedName,
        contact_info: contactInfo.trim() || undefined,
      });
      setName('');
      setContactInfo('');
      setSuccess(`Proveedor "${trimmedName}" registrado con éxito.`);
      onSupplierChanged();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al registrar proveedor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-sm animate-fadeIn sm:p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl" role="dialog" aria-modal="true" aria-labelledby="supplier-modal-title">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 id="supplier-modal-title" className="text-base font-bold text-slate-800">Administrar Proveedores</h3>
              <p className="text-xs text-slate-500">Registrá distribuidores y mayoristas para compras</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            data-testid="close-supplier-modal"
            aria-label="Cerrar proveedores"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-5 overflow-y-auto p-4 sm:p-6">
          {/* Create form */}
          <form onSubmit={handleCreate} className="flex flex-col gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200/70">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              Registrar nuevo proveedor
            </span>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Nombre / Razón Social <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  required
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ej: Distribuidora Pet S.A., Purina Mayorista..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  data-testid="supplier-name-input"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Información de contacto <span className="text-slate-400 font-normal">(teléfono, email o dirección)</span>
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={contactInfo}
                  onChange={e => setContactInfo(e.target.value)}
                  placeholder="Ej: 11-4567-8901 | pedidos@distribuidora.com"
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  data-testid="supplier-contact-input"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
                data-testid="save-supplier-btn"
              >
                <Plus className="w-4 h-4" />
                {loading ? 'Guardando...' : 'Agregar proveedor'}
              </button>
            </div>
          </form>

          {/* Feedback */}
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

          {/* Suppliers list */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wide pt-1">
              <span>Proveedores registrados</span>
              <span className="font-normal text-slate-400 font-mono">({suppliers.length})</span>
            </div>

            {suppliers.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No hay proveedores registrados aún. Creá el primero arriba.
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
                {suppliers.map(s => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200/70 transition-colors group"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm text-slate-800 font-medium truncate">{s.name}</span>
                      {s.contact_info ? (
                        <span className="text-xs text-slate-500 truncate">{s.contact_info}</span>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Sin datos de contacto</span>
                      )}
                    </div>
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
