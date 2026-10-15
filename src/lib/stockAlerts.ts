export type StockProductType = 'unit' | 'weight';
export type StockValue = number | string | null | undefined;

function finiteNonnegative(value: StockValue): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function isLowStock(
  stock: StockValue,
  minStock: StockValue,
  status: string | null | undefined = 'active',
): boolean {
  return status === 'active' && finiteNonnegative(stock) <= finiteNonnegative(minStock);
}

export function isOutOfStock(stock: StockValue): boolean {
  return finiteNonnegative(stock) === 0;
}

export function formatStockQuantity(value: StockValue, type: StockProductType): string {
  return finiteNonnegative(value).toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: type === 'unit' ? 0 : 3,
  });
}

export function stockUnit(type: StockProductType): 'uds' | 'kg' {
  return type === 'weight' ? 'kg' : 'uds';
}

export function validateMinimumStock(value: number, type: StockProductType): string | null {
  if (!Number.isFinite(value) || value < 0 || value !== Number(value.toFixed(3))) {
    return 'El mínimo debe ser cero o un valor positivo con hasta tres decimales.';
  }
  if (type === 'unit' && !Number.isInteger(value)) {
    return 'El mínimo de una presentación por unidad debe ser un número entero.';
  }
  return null;
}
