import type { ReportDateRange } from '../services/reportService';

export const BUSINESS_TIMEZONE = 'America/Argentina/Buenos_Aires';

export function getBusinessDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function shiftDate(date: string, days: number): string {
  const shifted = new Date(`${date}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export function getRecentRange(days: number): ReportDateRange {
  const to = getBusinessDate();
  return { from: shiftDate(to, -(days - 1)), to };
}

export function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${date}T12:00:00Z`));
}

export function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: BUSINESS_TIMEZONE,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}
