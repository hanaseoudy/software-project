/**
 * BON-01: pure helpers for the admin provider analytics (no framework code, so
 * they can be unit tested on their own).
 */

export type ProviderType = 'airline' | 'hotel';

/** One group returned by the database: a provider and a booking status. */
export interface StatusGroup {
  _id: { provider?: unknown; status: string };
  count: number;
  amount: number;
}

export interface ProviderStats {
  type: ProviderType;
  id: string | null;
  name: string;
  /** Confirmed and completed bookings (paid). */
  bookings: number;
  cancelled: number;
  /** Money from confirmed and completed bookings; cancelled bookings are not counted. */
  revenue: number;
  averageBookingValue: number;
}

export interface AnalyticsSummary {
  bookings: number;
  cancelled: number;
  revenue: number;
}

export const REVENUE_STATUSES = ['CONFIRMED', 'COMPLETED'] as const;
export const ANALYTICS_STATUSES = [...REVENUE_STATUSES, 'CANCELLED'] as const;
export const UNKNOWN_PROVIDER = 'Unknown provider';

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Merges the per-status groups of each provider into one row. */
export function buildProviderStats(
  type: ProviderType,
  groups: StatusGroup[],
  names: Map<string, string>,
): ProviderStats[] {
  const byProvider = new Map<string, ProviderStats>();

  for (const group of groups) {
    const provider = group._id.provider;
    const key = provider == null ? '' : String(provider);
    let stats = byProvider.get(key);
    if (!stats) {
      stats = {
        type,
        id: provider == null ? null : key,
        name: names.get(key) ?? UNKNOWN_PROVIDER,
        bookings: 0,
        cancelled: 0,
        revenue: 0,
        averageBookingValue: 0,
      };
      byProvider.set(key, stats);
    }
    if (group._id.status === 'CANCELLED') {
      stats.cancelled += group.count;
    } else {
      stats.bookings += group.count;
      stats.revenue += group.amount;
    }
  }

  return [...byProvider.values()].map((s) => ({
    ...s,
    revenue: round2(s.revenue),
    averageBookingValue: s.bookings ? round2(s.revenue / s.bookings) : 0,
  }));
}

/** Highest revenue first; name and id break ties so pages stay stable. */
export function byRevenue(a: ProviderStats, b: ProviderStats): number {
  return (
    b.revenue - a.revenue ||
    a.name.localeCompare(b.name) ||
    String(a.id).localeCompare(String(b.id))
  );
}

export function summarize(providers: ProviderStats[]): AnalyticsSummary {
  const total = providers.reduce(
    (sum, p) => ({
      bookings: sum.bookings + p.bookings,
      cancelled: sum.cancelled + p.cancelled,
      revenue: sum.revenue + p.revenue,
    }),
    { bookings: 0, cancelled: 0, revenue: 0 },
  );
  return { ...total, revenue: round2(total.revenue) };
}
