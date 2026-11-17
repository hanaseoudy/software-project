import { buildBookingSummary } from './booking-summary';
import type {
  SummaryAirport,
  SummaryBooking,
  SummaryFlight,
} from './booking-summary';

const cairo: SummaryAirport = { iataCode: 'CAI', name: 'Cairo Intl', city: 'Cairo', timezone: 'Africa/Cairo' };
const dubai: SummaryAirport = { iataCode: 'DXB', name: 'Dubai Intl', city: 'Dubai', timezone: 'Asia/Dubai' };

const outbound: SummaryFlight = {
  flightNumber: 'MS777',
  airlineName: 'EgyptAir',
  departureAirport: cairo,
  arrivalAirport: dubai,
  departureTime: new Date('2026-12-05T10:00:00.000Z'),
  arrivalTime: new Date('2026-12-05T13:00:00.000Z'),
  durationMinutes: 180,
};
const back: SummaryFlight = {
  ...outbound,
  flightNumber: 'MS778',
  departureAirport: dubai,
  arrivalAirport: cairo,
  departureTime: new Date('2026-12-12T10:00:00.000Z'),
  arrivalTime: new Date('2026-12-12T13:00:00.000Z'),
};

const now = new Date('2026-11-16T12:00:00.000Z');

function makeBooking(overrides: Partial<SummaryBooking> = {}): SummaryBooking {
  return {
    id: 'b1',
    status: 'PENDING_PAYMENT',
    tripType: 'ONE_WAY',
    cabinClass: 'ECONOMY',
    currency: 'USD',
    totalPrice: 210,
    baggageFees: 40,
    holdExpiresAt: new Date('2026-11-16T12:10:00.000Z'),
    passengers: [
      {
        firstName: 'Mariam',
        lastName: 'Mashoud',
        type: 'ADULT',
        dateOfBirth: new Date('2002-05-20T00:00:00.000Z'),
        documentType: 'PASSPORT',
        documentNumber: 'A12345678',
        baggage: [
          { weightKg: 23, isExtra: false },
          { weightKg: 20, isExtra: true },
          { weightKg: 18, isExtra: true },
        ],
      },
      {
        firstName: 'Baby',
        lastName: 'Mashoud',
        type: 'INFANT',
        dateOfBirth: new Date('2026-01-01T00:00:00.000Z'),
        documentType: 'PASSPORT',
        documentNumber: 'B7654321',
      },
    ],
    ...overrides,
  };
}

describe('buildBookingSummary', () => {
  it('shows the flight, passengers, baggage and total', () => {
    const summary = buildBookingSummary(makeBooking(), outbound, undefined, now);

    expect(summary.flights).toHaveLength(1);
    expect(summary.flights[0]).toMatchObject({ segment: 'OUTBOUND', flightNumber: 'MS777' });
    expect(summary.passengers).toHaveLength(2);
    expect(summary.passengers[0].dateOfBirth).toBe('2002-05-20');
    expect(summary.passengers[0].baggage).toHaveLength(3);
    expect(summary.passengers[0].extraBags).toBe(2);
    expect(summary.passengers[1].baggage).toEqual([]);
    expect(summary.baggage).toEqual({ extraBags: 2, fees: 40 });
  });

  it('total is the seat fares plus the baggage fees', () => {
    const summary = buildBookingSummary(makeBooking(), outbound, undefined, now);

    expect(summary.pricing).toEqual({
      currency: 'USD',
      fareTotal: 210,
      baggageFees: 40,
      total: 250,
    });
  });

  it('treats missing baggage fees as zero', () => {
    const summary = buildBookingSummary(
      makeBooking({ baggageFees: undefined }),
      outbound,
      undefined,
      now,
    );

    expect(summary.pricing.baggageFees).toBe(0);
    expect(summary.pricing.total).toBe(210);
  });

  it('rounds the total to 2 decimals', () => {
    const summary = buildBookingSummary(
      makeBooking({ totalPrice: 10.1, baggageFees: 0.2 }),
      outbound,
      undefined,
      now,
    );

    expect(summary.pricing.total).toBe(10.3);
  });

  it('lists the return flight as a second segment for a round trip', () => {
    const summary = buildBookingSummary(
      makeBooking({ tripType: 'ROUND_TRIP' }),
      outbound,
      back,
      now,
    );

    expect(summary.flights.map((f) => f.segment)).toEqual(['OUTBOUND', 'RETURN']);
    expect(summary.flights[1].flightNumber).toBe('MS778');
  });

  it('canPay is true only for a pending booking whose hold has not ended', () => {
    expect(buildBookingSummary(makeBooking(), outbound, undefined, now).canPay).toBe(true);
    expect(
      buildBookingSummary(
        makeBooking({ holdExpiresAt: new Date('2026-11-16T11:59:00.000Z') }),
        outbound,
        undefined,
        now,
      ).canPay,
    ).toBe(false);
    expect(
      buildBookingSummary(makeBooking({ status: 'CONFIRMED' }), outbound, undefined, now).canPay,
    ).toBe(false);
  });
});
