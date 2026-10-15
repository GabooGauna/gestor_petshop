import React, { useState, useEffect } from "react";
import { productService } from "../services/productService";
import {
  ArrowLeft,
  Plus,
  Check,
  Layers,
  Calculator,
  PackageCheck,
} from "lucide-react";
import type { Database } from "../types/database.types";
import { validateMinimumStock } from "../lib/stockAlerts";

type Category = Database["public"]["Tables"]["categories"]["Row"];

interface ProductFormProps {
  onProductAdded: (productName: string) => void;
  onCancel?: () => void;
}

function calcPricePerKg(
  priceBulk: number,
  weightKg: number,
  margenPct: number,
): number {
  if (!priceBulk || !weightKg) return 0;
  const basePorKg = priceBulk / weightKg;
  return basePorKg * (1 + margenPct / 100);
}

export function ProductForm({ onProductAdded, onCancel }: ProductFormProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [type, setType] = useState<"weight" | "unit">("weight");

  // Presentación inicial
  const [presName, setPresName] = useState("Bolsa 20kg");
  const [weightKg, setWeightKg] = useState("20");
  const [cost, setCost] = useState("");
  const [priceBulk, setPriceBulk] = useState("");
  const [margenPct, setMargenPct] = useState("10");
  const [initialStock, setInitialStock] = useState("0");
  const [minimumStock, setMinimumStock] = useState("0");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Creación rápida de categoría inline
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [creatingCat, setCreatingCat] = useState(false);

  const loadCategories = async () => {
    try {
      const data = await productService.getCategories();
      setCategories(data);
    } catch (err) {
      console.error("Error al cargar categorías:", err);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCategories();
  }, []);

  // Actualizar nombre de presentación sugerido al cambiar tipo o peso
  // Presentation name follows the explicit type/weight inputs.
  useEffect(() => {
    if (type === "weight") {
      if (weightKg) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPresName(`Bolsa ${weightKg}kg`);
      } else {
        setPresName("Bolsa");
      }
    } else {
      setPresName("Unidad");
    }
  }, [type, weightKg]);

  const handleCreateQuickCategory = async () => {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    setCreatingCat(true);
    setError(null);
    try {
      const created = await productService.createCategory(trimmed);
      setCategories((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setCategoryId(created.id);
      setNewCatName("");
      setShowNewCatInput(false);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error al crear categoría.",
      );
    } finally {
      setCreatingCat(false);
    }
  };

  // Preview del $/kg calculado
  const previewPricePerKg = (() => {
    if (type !== "weight") return null;
    const b = Number(priceBulk);
    const w = Number(weightKg);
    const m = Number(margenPct);
    if (!b || !w) return null;
    return calcPricePerKg(b, w, m);
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName || !categoryId) {
      setError(
        "Por favor completá el nombre del producto y seleccioná una categoría.",
      );
      return;
    }

    const costNum = Number(cost) || 0;
    const priceNum = Number(priceBulk) || 0;
    const minimumStockNum = Number(minimumStock);
    const minimumError = validateMinimumStock(minimumStockNum, type);
    if (minimumError) {
      setError(minimumError);
      return;
    }
    const weightNum = type === "weight" ? Number(weightKg) || 0 : null;
    const calculatedPricePerKg =
      type === "weight" && weightNum && priceNum
        ? calcPricePerKg(priceNum, weightNum, Number(margenPct) || 0)
        : null;

    setLoading(true);
    try {
      await productService.createProductWithPresentation({
        product: {
          name: trimmedName,
          category_id: categoryId,
          type,
        },
        presentation: {
          name: presName.trim() || (type === "weight" ? "Bolsa" : "Unidad"),
          weight_kg: weightNum,
          cost: costNum,
          price: priceNum,
          price_per_kg: calculatedPricePerKg,
          initialStock: initialStock as `${number}`,
          min_stock: minimumStockNum,
        },
      });

      onProductAdded(trimmedName);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error al crear el producto.",
      );
      setLoading(false);
    }
  };

  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-slate-200 w-full"
      data-testid="new-product-form"
    >
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
            <h2 className="text-xl font-bold text-slate-800">Nuevo Producto</h2>
            <p className="text-xs text-slate-500">
              Configurá el producto y su presentación inicial
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 p-4 sm:p-6">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg" role="alert">
            {error}
          </div>
        )}

        {/* 1. Datos Generales */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
            Nombre del Producto <span className="text-red-500">*</span>
          </label>
          <input
            required
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all text-sm"
            placeholder="Ej: Dog Chow Adultos"
            data-testid="product-name-input"
          />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
          {/* Categoría */}
          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
                Categoría <span className="text-red-500">*</span>
              </label>
              {!showNewCatInput ? (
                <button
                  type="button"
                  onClick={() => setShowNewCatInput(true)}
                  className="text-xs text-[#2563EB] hover:text-blue-700 font-medium flex items-center gap-1 transition-colors"
                  data-testid="btn-add-quick-category"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nueva categoría
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setShowNewCatInput(false);
                    setNewCatName("");
                  }}
                  className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Cancelar
                </button>
              )}
            </div>

            {showNewCatInput ? (
              <div className="flex gap-1.5 items-center">
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Ej: Alimento Perro"
                  className="flex-1 p-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB] text-sm"
                  data-testid="quick-category-input"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleCreateQuickCategory();
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={creatingCat || !newCatName.trim()}
                  onClick={() => void handleCreateQuickCategory()}
                  className="p-2 bg-[#2563EB] hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors"
                  title="Guardar categoría"
                  data-testid="save-quick-category-btn"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <select
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all text-sm bg-white"
                data-testid="product-category-select"
              >
                <option value="">Seleccione una categoría</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Tipo de venta */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Tipo de Venta <span className="text-red-500">*</span>
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as "weight" | "unit")}
              className="w-full p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent transition-all text-sm bg-white"
              data-testid="product-type-select"
            >
              <option value="weight">
                Por Peso (Bolsa / Fraccionado en Kg)
              </option>
              <option value="unit">
                Por Unidad (Accesorios, Pipetas, etc.)
              </option>
            </select>
          </div>
        </div>

        {/* 2. Sección: Presentación Inicial */}
        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2 text-slate-800">
            <Layers className="w-4 h-4 text-[#2563EB]" />
            <span className="font-semibold text-sm">Presentación Inicial</span>
            <span className="text-xs text-slate-400 font-normal">
              (podrás agregar más presentaciones luego)
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Nombre de la Presentación
              </label>
              <input
                type="text"
                value={presName}
                onChange={(e) => setPresName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#2563EB] bg-white outline-none"
                placeholder={
                  type === "weight" ? "Ej: Bolsa 20kg" : "Ej: Unidad"
                }
                data-testid="presentation-name-input"
              />
            </div>

            {type === "weight" ? (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Peso del Bulto (kg)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#2563EB] bg-white outline-none"
                  placeholder="20"
                  data-testid="presentation-weight-input"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Stock Inicial (uds)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={initialStock}
                  onChange={(e) => setInitialStock(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#2563EB] bg-white outline-none"
                  placeholder="0"
                  data-testid="presentation-stock-input"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Precio de Venta ($)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={priceBulk}
                  onChange={(e) => setPriceBulk(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#10B981] bg-white outline-none"
                  placeholder="30000"
                  data-testid="presentation-price-input"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Costo de Compra ($)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#2563EB] bg-white outline-none"
                  placeholder="25000"
                  data-testid="presentation-cost-input"
                />
              </div>
            </div>
          </div>

          {type === "weight" && (
            <>
              {/* Margen venta suelta */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Margen adicional para venta suelta (%)
                  <span className="ml-1 text-slate-400 font-normal">
                    — recargo para venta fraccionada por kg
                  </span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={margenPct}
                    onChange={(e) => setMargenPct(e.target.value)}
                    className="flex-1 accent-[#10B981]"
                  />
                  <div className="relative w-20">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={margenPct}
                      onChange={(e) => setMargenPct(e.target.value)}
                      className="w-full pr-5 pl-2 py-1.5 border border-slate-200 rounded-lg text-sm text-center bg-white focus:ring-2 focus:ring-[#10B981] outline-none"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                      %
                    </span>
                  </div>
                </div>
              </div>

              {/* Stock inicial en kg */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Stock Inicial (kg)
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={initialStock}
                  onChange={(e) => setInitialStock(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-[#2563EB] bg-white outline-none"
                  placeholder="0"
                  data-testid="presentation-stock-input"
                />
              </div>

              {/* Preview $/kg */}
              {previewPricePerKg != null && previewPricePerKg > 0 && (
                <div className="flex flex-col gap-2 rounded-lg border border-green-200 bg-green-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-green-800 text-xs font-medium">
                    <Calculator className="w-4 h-4 text-green-600" />
                    <span>Precio calculado para venta suelta:</span>
                  </div>
                  <span className="text-sm font-bold text-green-700 font-mono">
                    ${previewPricePerKg.toFixed(2)} / kg
                  </span>
                </div>
              )}
            </>
          )}

          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3">
            <label htmlFor="presentation-min-stock" className="block text-xs font-semibold text-amber-900">
              Stock mínimo para reposición ({type === "weight" ? "kg" : "uds"})
            </label>
            <input
              id="presentation-min-stock"
              required
              type="number"
              min="0"
              step={type === "weight" ? "0.001" : "1"}
              value={minimumStock}
              onChange={(e) => setMinimumStock(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500 sm:max-w-48"
              data-testid="presentation-min-stock-input"
            />
            <p className="mt-1.5 text-[11px] leading-4 text-amber-800">
              Home avisará cuando el stock sea igual o menor. Con 0, sólo avisará al agotarse.
            </p>
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
            disabled={loading}
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50 sm:w-auto"
            data-testid="submit-new-product"
          >
            <PackageCheck className="w-4 h-4" />
            {loading ? "Guardando..." : "Guardar producto y presentación"}
          </button>
        </div>
      </form>
    </div>
  );
}
