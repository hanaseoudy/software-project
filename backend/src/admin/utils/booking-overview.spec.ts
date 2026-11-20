import {
  createdAtRange,
  newestFirst,
  toFlightRow,
  toHotelRow,
} from './booking-overview';
import type { OverviewRow } from './booking-overview';

const user = {
  _id: 'u1',
  firstName: 'Mariam',
  lastName: 'Test',
  email: 'm@example.com',
};

describe('createdAtRange', () => {
  it('is undefined without dates', () => {
    expect(createdAtRange()).toBeUndefined();
  });

  it('includes the whole "to" day', () => {
    expect(createdAtRange('2026-11-01', '2026-11-30')).toEqual({
      $gte: new Date('2026-11-01T00:00:00Z'),
      $lt: new Date('2026-12-01T00:00:00Z'),
    });
  });

  it('works with only one side and ignores the time part', () => {
    expect(createdAtRange('2026-11-05T15:30:00Z')).toEqual({
      $gte: new Date('2026-11-05T00:00:00Z'),
    });
    expect(createdAtRange(undefined, '2026-11-05')).toEqual({
      $lt: new Date('2026-11-06T00:00:00Z'),
    });
  });

  it('accepts the same day for from and to', () => {
    expect(createdAtRange('2026-11-05', '2026-11-05')).toEqual({
      $gte: new Date('2026-11-05T00:00:00Z'),
      $lt: new Date('2026-11-06T00:00:00Z'),
    });
  });

  it('rejects from after to', () => {
    expect(() => createdAtRange('2026-11-10', '2026-11-01')).toThrow(
      'From must not be after to',
    );
  });
});

describe('toHotelRow', () => {
  it('maps a hotel reservation', () => {
    const createdAt = new Date('2026-11-10T10:00:00Z');
    expect(
      toHotelRow({
        _id: 'h1',
        bookingReference: 'HTL-ABCD2345',
        user,
        hotel: { name: 'Nile Hotel' },
        checkIn: new Date('2026-12-01'),
        checkOut: new Date('2026-12-04'),
        totalPrice: 300,
        currency: 'USD',
        status: 'CONFIRMED',
        createdAt,
      }),
    ).toEqual({
      type: 'hotel',
      id: 'h1',
      reference: 'HTL-ABCD2345',
      user: { id: 'u1', name: 'Mariam Test', email: 'm@example.com' },
      provider: 'Nile Hotel',
      startDate: new Date('2026-12-01'),
      endDate: new Date('2026-12-04'),
      amount: 300,
      currency: 'USD',
      status: 'CONFIRMED',
      createdAt,
    });
  });

  it('has no reference before payment and survives a deleted user or hotel', () => {
    const row = toHotelRow({
      _id: 'h2',
      user: null,
      hotel: null,
      checkIn: new Date('2026-12-01'),
      checkOut: new Date('2026-12-04'),
      totalPrice: 100,
      currency: 'USD',
      status: 'PENDING_PAYMENT',
      createdAt: new Date(),
    });
    expect(row.reference).toBeNull();
    expect(row.user).toBeNull();
    expect(row.provider).toBeNull();
  });
});

describe('toFlightRow', () => {
  const base = {
    _id: 'f1',
    user,
    totalPrice: 100,
    baggageFees: 20.5,
    currency: 'USD',
    status: 'CONFIRMED',
    createdAt: new Date('2026-11-10T10:00:00Z'),
  };

  it('one way: dates of the outbound flight, amount = fares + baggage fees', () => {
    const row = toFlightRow({
      ...base,
      bookingReference: 'FLT-ABCD2345',
      outboundFlight: {
        departureTime: new Date('2026-12-05T10:00:00Z'),
        arrivalTime: new Date('2026-12-05T13:00:00Z'),
        airline: { name: 'EgyptAir' },
      },
    });
    expect(row).toMatchObject({
      type: 'flight',
      reference: 'FLT-ABCD2345',
      provider: 'EgyptAir',
      startDate: new Date('2026-12-05T10:00:00Z'),
      endDate: new Date('2026-12-05T13:00:00Z'),
      amount: 120.5,
    });
  });

  it('round trip: ends when the return flight arrives; lists both airlines once each', () => {
    const row = toFlightRow({
      ...base,
      outboundFlight: {
        departureTime: new Date('2026-12-05T10:00:00Z'),
        arrivalTime: new Date('2026-12-05T13:00:00Z'),
        airline: { name: 'EgyptAir' },
      },
      returnFlight: {
        arrivalTime: new Date('2026-12-12T20:00:00Z'),
        airline: { name: 'Emirates' },
      },
    });
    expect(row.provider).toBe('EgyptAir / Emirates');
    expect(row.endDate).toEqual(new Date('2026-12-12T20:00:00Z'));

    const same = toFlightRow({
      ...base,
      outboundFlight: { airline: { name: 'EgyptAir' } },
      returnFlight: { airline: { name: 'EgyptAir' } },
    });
    expect(same.provider).toBe('EgyptAir');
  });

  it('copes with missing flight data and no reference', () => {
    const row = toFlightRow({
      ...base,
      baggageFees: undefined,
      outboundFlight: null,
    });
    expect(row).toMatchObject({
      reference: null,
      provider: null,
      startDate: null,
      endDate: null,
      amount: 100,
    });
  });
});

describe('newestFirst', () => {
  const row = (id: string, createdAt: string) =>
    ({ id, createdAt: new Date(createdAt) }) as OverviewRow;

  it('sorts by creation date, newest first, ties by id', () => {
    const rows = [
      row('a', '2026-11-01'),
      row('c', '2026-11-03'),
      row('b', '2026-11-03'),
    ];
    expect(rows.sort(newestFirst).map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('puts rows without createdAt (old data) last instead of failing', () => {
    const rows = [
      { id: 'x', createdAt: null } as OverviewRow,
      row('a', '2026-11-01'),
      { id: 'y', createdAt: null } as OverviewRow,
    ];
    expect(rows.sort(newestFirst).map((r) => r.id)).toEqual(['a', 'y', 'x']);
  });
});
