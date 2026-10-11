import type { MovementType, PaymentMethod } from '../services/reportService';

const currency = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 2,
});

export const compactCurrency = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', notation: 'compact', maximumFractionDigits: 1,
});

export const reportLongDate = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long', day: '2-digit', month: 'long', timeZone: 'UTC',
});

export const paymentLabels: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito: 'Crédito',
  mercado_pago: 'Mercado Pago',
  otro: 'Otro',
};

export const movementLabels: Record<MovementType, string> = {
  compra: 'Compra', venta: 'Venta', ajuste: 'Ajuste', merma: 'Merma',
};

export function formatMovementReason(reason: string | null, referenceId: string | null): string {
  const normalizedReason = reason?.trim() ?? '';
  const normalizedReference = referenceId?.trim() ?? '';
  if (!normalizedReason || !normalizedReference) return normalizedReason;

  for (const label of [movementLabels.compra, movementLabels.venta]) {
    if (normalizedReason.toLocaleLowerCase('es-AR') === `${label} ${normalizedReference}`.toLocaleLowerCase('es-AR')) {
      return label;
    }
  }

  return normalizedReason;
}

export function formatMoney(value: string): string {
  return currency.format(Number(value));
}

