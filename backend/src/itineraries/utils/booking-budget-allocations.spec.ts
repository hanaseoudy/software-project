import { Types } from 'mongoose';
import {
  allocateBooking,
  centsAmount,
  moneyCents,
} from './booking-budget-allocations';
describe('ITN-27 exact allocations and direct booking structure', () => {
  const id = () => new Types.ObjectId().toString();
  let context: Parameters<typeof allocateBooking>[0];
  let flightId: string,
    from: string,
    to: string,
    hotelId: string,
    cityId: string;
  beforeEach(() => {
    flightId = id();
    from = id();
    to = id();
    hotelId = id();
    cityId = id();
    context = {
      type: 'hotel',
      booking: {
        hotel: hotelId,
        currency: 'USD',
        totalPrice: 100,
        checkIn: new Date('2040-12-31Z'),
        checkOut: new Date('2041-01-03Z'),
      },
      days: [0, 1, 2].map((i) => ({
        _id: id(),
        dayNumber: i + 1,
        cityId: 'london',
      })),
      selected: [],
      startDate: new Date('2040-12-31Z'),
      flights: new Map([
        [
          flightId,
          {
            departureAirport: from,
            arrivalAirport: to,
            departureTime: new Date('2040-12-30T22:00:00Z'),
            arrivalTime: new Date('2040-12-31T02:00:00Z'),
            status: 'SCHEDULED',
          },
        ],
      ]),
      airports: new Map([
        [from, { city: 'cairo', country: 'EG', timezone: 'Africa/Cairo' }],
        [to, { city: 'london', country: 'GB', timezone: 'Europe/London' }],
      ]),
      hotels: new Map([[hotelId, { city: cityId }]]),
      cities: new Map([
        [cityId, { cityId: 'london', countryCode: 'GB' }],
        ['london', { cityId: 'london', countryCode: 'GB' }],
      ]),
    };
    context.selected = context.days.map((day) => String(day._id));
  });
  const asFlight = () => {
    context.type = 'flight';
    context.booking = {
      tripType: 'ONE_WAY',
      outboundFlight: flightId,
      totalPrice: 300,
      baggageFees: 30,
      currency: 'USD',
    };
    context.selected = [String(context.days[0]._id)];
  };
  it('allocates hotel remainder cents to earliest nights across year boundary', () => {
    const result = allocateBooking(context);
    expect(result.amount).toBe(100);
    expect(result.allocations.map((a) => a.amount)).toEqual([
      33.34, 33.33, 33.33,
    ]);
    expect(result.allocations.map((a) => a.date)).toEqual([
      '2040-12-31',
      '2041-01-01',
      '2041-01-02',
    ]);
    expect(
      result.allocations.reduce((sum, a) => sum + moneyCents(a.amount), 0n),
    ).toBe(10000n);
  });
  it('supports zero and tiny totals exactly without negative allocations', () => {
    context.booking.totalPrice = 0.01;
    expect(allocateBooking(context).allocations.map((a) => a.amount)).toEqual([
      0.01, 0, 0,
    ]);
    context.booking.totalPrice = 0;
    expect(
      allocateBooking(context).allocations.every((a) => a.amount === 0),
    ).toBe(true);
  });
  it('requires all hotel nights and rejects wrong-city, duplicate or missing days', () => {
    for (const kind of ['partial', 'city', 'duplicate', 'missing']) {
      const input = {
        ...context,
        days: context.days.map((d) => ({ ...d })),
        selected: [...context.selected],
      };
      if (kind === 'partial') input.selected.pop();
      if (kind === 'city') input.days[1].cityId = 'cairo';
      if (kind === 'duplicate') input.selected[1] = input.selected[0];
      if (kind === 'missing') input.selected[1] = id();
      expect(() => allocateBooking(input)).toThrow();
    }
  });
  it('requires hotel date coverage including leap days', () => {
    context.startDate = new Date('2040-02-28Z');
    context.booking.checkIn = new Date('2040-02-28Z');
    context.booking.checkOut = new Date('2040-03-02Z');
    expect(allocateBooking(context).allocations.map((a) => a.date)).toEqual([
      '2040-02-28',
      '2040-02-29',
      '2040-03-01',
    ]);
    context.days[1].dayNumber = 3;
    expect(() => allocateBooking(context)).toThrow();
  });
  it('charges complete flight reservation including baggage once on the outbound arrival day', () => {
    asFlight();
    expect(allocateBooking(context)).toMatchObject({
      amount: 330,
      allocations: [
        { category: 'INTERCITY_TRANSPORT', amount: 330, date: '2040-12-31' },
      ],
    });
  });
  it('anchors direct round trip to outbound arrival, not return arrival', () => {
    asFlight();
    const back = id();
    context.booking.tripType = 'ROUND_TRIP';
    context.booking.returnFlight = back;
    context.flights.set(back, {
      departureAirport: to,
      arrivalAirport: from,
      departureTime: new Date('2041-01-02T10:00Z'),
    });
    expect(allocateBooking(context).allocations[0].date).toBe('2040-12-31');
    context.selected = [String(context.days[2]._id)];
    expect(() => allocateBooking(context)).toThrow();
  });
  it('uses airport-local arrival date across UTC midnight', () => {
    asFlight();
    context.flights.get(flightId).arrivalTime = new Date('2041-01-01T02:00Z');
    context.airports.set(to, {
      city: 'london',
      country: 'GB',
      timezone: 'America/New_York',
    });
    expect(allocateBooking(context).allocations[0].date).toBe('2040-12-31');
  });
  it.each([
    'segments',
    'legs',
    'outboundFlights',
    'outboundSegments',
    'returnSegments',
  ])('rejects unsupported connecting field %s', (key) => {
    asFlight();
    context.booking[key] = [flightId];
    expect(() => allocateBooking(context)).toThrow(
      'Unsupported flight booking structure',
    );
  });
  it.each([
    'missing-outbound',
    'array-outbound',
    'missing-return',
    'extra-return',
    'bad-type',
    'bad-route',
    'cancelled',
    'bad-time',
  ])('rejects malformed direct structure %s', (kind) => {
    asFlight();
    if (kind === 'missing-outbound') delete context.booking.outboundFlight;
    if (kind === 'array-outbound') context.booking.outboundFlight = [flightId];
    if (kind === 'missing-return') context.booking.tripType = 'ROUND_TRIP';
    if (kind === 'extra-return') context.booking.returnFlight = id();
    if (kind === 'bad-type') context.booking.tripType = 'MULTI_CITY';
    if (kind === 'bad-route')
      context.flights.get(flightId).arrivalAirport = from;
    if (kind === 'cancelled')
      context.flights.get(flightId).status = 'CANCELLED';
    if (kind === 'bad-time')
      context.flights.get(flightId).arrivalTime = new Date(NaN);
    expect(() => allocateBooking(context)).toThrow();
  });
  it.each([-1, NaN, Infinity, '12', 0.001, 1e20])(
    'rejects unsafe amount %s',
    (value) => {
      expect(() => moneyCents(value)).toThrow();
    },
  );
  it('rejects changed currency and preserves inputs', () => {
    const before = JSON.stringify(context.booking);
    allocateBooking(context);
    expect(JSON.stringify(context.booking)).toBe(before);
    context.booking.currency = 'EUR';
    expect(() => allocateBooking(context)).toThrow('Invalid booking currency');
    expect(centsAmount(123n)).toBe(1.23);
  });
});
