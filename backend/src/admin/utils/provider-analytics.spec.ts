import {
  buildProviderStats,
  byRevenue,
  summarize,
  UNKNOWN_PROVIDER,
} from './provider-analytics';
import type { StatusGroup } from './provider-analytics';

const g = (
  provider: string | null,
  status: string,
  count: number,
  amount: number,
): StatusGroup => ({
  _id: { provider: provider ?? undefined, status },
  count,
  amount,
});

describe('buildProviderStats', () => {
  const names = new Map([
    ['a1', 'EgyptAir'],
    ['a2', 'Nile Air'],
  ]);

  it('merges the status groups of one provider', () => {
    const [row] = buildProviderStats(
      'airline',
      [
        g('a1', 'CONFIRMED', 2, 200),
        g('a1', 'COMPLETED', 1, 100.1),
        g('a1', 'CANCELLED', 3, 999),
      ],
      names,
    );
    expect(row).toEqual({
      type: 'airline',
      id: 'a1',
      name: 'EgyptAir',
      bookings: 3,
      cancelled: 3,
      revenue: 300.1,
      averageBookingValue: 100.03,
    });
  });

  it('does not count cancelled bookings as revenue', () => {
    const [row] = buildProviderStats(
      'hotel',
      [g('a1', 'CANCELLED', 2, 500)],
      names,
    );
    expect(row).toMatchObject({
      bookings: 0,
      cancelled: 2,
      revenue: 0,
      averageBookingValue: 0,
    });
  });

  it('keeps providers apart and names a missing provider', () => {
    const rows = buildProviderStats(
      'airline',
      [
        g('a1', 'CONFIRMED', 1, 10),
        g('a2', 'CONFIRMED', 1, 20),
        g('gone', 'CONFIRMED', 1, 5),
        g(null, 'CONFIRMED', 1, 1),
      ],
      names,
    );
    expect(rows.map((r) => r.name)).toEqual([
      'EgyptAir',
      'Nile Air',
      UNKNOWN_PROVIDER,
      UNKNOWN_PROVIDER,
    ]);
    expect(rows[3].id).toBeNull();
  });

  it('avoids floating point drift in revenue', () => {
    const [row] = buildProviderStats(
      'hotel',
      [g('a1', 'CONFIRMED', 1, 0.1), g('a1', 'COMPLETED', 1, 0.2)],
      names,
    );
    expect(row.revenue).toBe(0.3);
  });
});

describe('byRevenue and summarize', () => {
  const rows = buildProviderStats(
    'hotel',
    [
      g('b', 'CONFIRMED', 1, 50),
      g('a', 'CONFIRMED', 1, 50),
      g('c', 'CONFIRMED', 2, 400),
      g('c', 'CANCELLED', 1, 70),
    ],
    new Map([
      ['a', 'Alpha'],
      ['b', 'Beta'],
      ['c', 'Cairo'],
    ]),
  );

  it('sorts by revenue, then by name', () => {
    expect([...rows].sort(byRevenue).map((r) => r.name)).toEqual([
      'Cairo',
      'Alpha',
      'Beta',
    ]);
  });

  it('adds up all providers', () => {
    expect(summarize(rows)).toEqual({
      bookings: 4,
      cancelled: 1,
      revenue: 500,
    });
  });

  it('is zero without providers', () => {
    expect(summarize([])).toEqual({ bookings: 0, cancelled: 0, revenue: 0 });
  });
});
