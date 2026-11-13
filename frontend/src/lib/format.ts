/**
 * GEN-15: one way to show money and dates on every page, so users never
 * have to decode raw numbers or ISO strings.
 */

/** Platform currency for prices, payments and refunds (PAY-04). */
export const PLATFORM_CURRENCY = 'USD';

export function formatMoney(amount: number, currency: string = PLATFORM_CURRENCY): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

/** e.g. "Fri, 13 Nov 2026". Pass `timeZone` to show a place's local date (GEN-06). */
export function formatDate(value: string | Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(new Date(value));
}

/** e.g. "Fri, 13 Nov 2026, 14:05". Pass the airport's IANA zone for flight times (GEN-06). */
export function formatDateTime(value: string | Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(value));
}

/** "1 night", "3 nights", "1 passenger"… */
export function plural(count: number, singular: string, pluralWord = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralWord}`;
}
