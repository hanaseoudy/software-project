import 'reflect-metadata';
import { AdminAnalyticsService } from './admin-analytics.service';

// The @nestjs/* packages are ES modules that jest cannot load here, and the
// service only needs them for decorators and exceptions, so they are stubbed.
jest.mock('@nestjs/common', () => ({
  Injectable: () => () => undefined,
  BadRequestException: class BadRequestException extends Error {},
}));
jest.mock('@nestjs/swagger', () => ({
  ApiProperty: () => () => undefined,
  ApiPropertyOptional: () => () => undefined,
}));
jest.mock('@nestjs/mongoose', () => ({ InjectModel: () => () => undefined }));
jest.mock('../airlines/schemas/airline.schema', () => ({
  Airline: { name: 'Airline' },
}));
jest.mock('../hotels/schemas/hotel.schema', () => ({
  Hotel: { name: 'Hotel' },
}));
jest.mock('../flights/schemas/flight.schema', () => ({
  Flight: { name: 'Flight' },
}));
jest.mock('../flight-bookings/schemas/flight-booking.schema', () => ({
  FlightBooking: { name: 'FlightBooking' },
}));
jest.mock('../hotel-bookings/schemas/hotel-booking.schema', () => ({
  HotelBooking: { name: 'HotelBooking' },
}));
jest.mock('./dto/list-bookings-query.dto', () => ({
  AdminBookingType: { FLIGHT: 'flight', HOTEL: 'hotel' },
}));
jest.mock('./dto/provider-analytics-query.dto', () => ({}));

const lean = (result: unknown) => {
  const q: { select: jest.Mock; lean: jest.Mock } = {
    select: jest.fn(),
    lean: jest.fn().mockResolvedValue(result),
  };
  q.select.mockReturnValue(q);
  return q;
};

function setup(
  opts: {
    flightGroups?: unknown[];
    hotelGroups?: unknown[];
    airlines?: unknown[];
    hotels?: unknown[];
  } = {},
) {
  const flightBookingModel = {
    aggregate: jest.fn().mockResolvedValue(opts.flightGroups ?? []),
  };
  const hotelBookingModel = {
    aggregate: jest.fn().mockResolvedValue(opts.hotelGroups ?? []),
  };
  const flightModel = { collection: { name: 'flights' } };
  const airlineModel = { find: jest.fn(() => lean(opts.airlines ?? [])) };
  const hotelModel = { find: jest.fn(() => lean(opts.hotels ?? [])) };
  const service = new AdminAnalyticsService(
    flightBookingModel as never,
    hotelBookingModel as never,
    flightModel as never,
    airlineModel as never,
    hotelModel as never,
  );
  return {
    service,
    flightBookingModel,
    hotelBookingModel,
    airlineModel,
    hotelModel,
  };
}

const group = (
  provider: string,
  status: string,
  count: number,
  amount: number,
) => ({
  _id: { provider, status },
  count,
  amount,
});

describe('AdminAnalyticsService.providerAnalytics', () => {
  it('shows airlines and hotels together, highest revenue first', async () => {
    const t = setup({
      flightGroups: [group('a1', 'CONFIRMED', 2, 300)],
      hotelGroups: [
        group('h1', 'COMPLETED', 1, 500),
        group('h1', 'CANCELLED', 1, 80),
      ],
      airlines: [{ _id: 'a1', name: 'EgyptAir' }],
      hotels: [{ _id: 'h1', name: 'Nile View' }],
    });
    const result = await t.service.providerAnalytics({ page: 1 });

    expect(result.currency).toBe('USD');
    expect(result.summary).toEqual({ bookings: 3, cancelled: 1, revenue: 800 });
    expect(result.items.map((i) => [i.type, i.name, i.revenue])).toEqual([
      ['hotel', 'Nile View', 500],
      ['airline', 'EgyptAir', 300],
    ]);
    expect(result).toMatchObject({
      total: 2,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });
  });

  it('only reads paid and cancelled bookings and sums seat fares plus baggage', async () => {
    const t = setup();
    await t.service.providerAnalytics({ page: 1 });
    const pipeline = t.flightBookingModel.aggregate.mock.calls[0][0];
    expect(pipeline[0].$match.status).toEqual({
      $in: ['CONFIRMED', 'COMPLETED', 'CANCELLED'],
    });
    expect(pipeline[1].$lookup.from).toBe('flights');
    expect(JSON.stringify(pipeline[2].$group.amount)).toContain('baggageFees');
  });

  it('filters by the creation date of the booking, whole days included', async () => {
    const t = setup();
    await t.service.providerAnalytics({
      page: 1,
      from: '2026-11-01',
      to: '2026-11-30',
    });
    const match = t.hotelBookingModel.aggregate.mock.calls[0][0][0].$match;
    expect(match.createdAt).toEqual({
      $gte: new Date('2026-11-01T00:00:00.000Z'),
      $lt: new Date('2026-12-01T00:00:00.000Z'),
    });
  });

  it('returns the period that was asked for', async () => {
    const t = setup();
    const result = await t.service.providerAnalytics({
      page: 1,
      from: '2026-11-01',
    });
    expect(result.period).toEqual({ from: '2026-11-01', to: null });
  });

  it('rejects a period that ends before it starts', async () => {
    const t = setup();
    await expect(
      t.service.providerAnalytics({
        page: 1,
        from: '2026-12-01',
        to: '2026-11-01',
      }),
    ).rejects.toThrow('From must not be after to');
    expect(t.flightBookingModel.aggregate).not.toHaveBeenCalled();
  });

  it('only reads hotels when type is hotel, and only airlines when type is flight', async () => {
    const hotels = setup();
    await hotels.service.providerAnalytics({ page: 1, type: 'hotel' as never });
    expect(hotels.flightBookingModel.aggregate).not.toHaveBeenCalled();
    expect(hotels.hotelBookingModel.aggregate).toHaveBeenCalled();

    const flights = setup();
    await flights.service.providerAnalytics({
      page: 1,
      type: 'flight' as never,
    });
    expect(flights.hotelBookingModel.aggregate).not.toHaveBeenCalled();
    expect(flights.flightBookingModel.aggregate).toHaveBeenCalled();
  });

  it('is empty without bookings and does not look up names', async () => {
    const t = setup();
    const result = await t.service.providerAnalytics({ page: 1 });
    expect(result).toMatchObject({
      summary: { bookings: 0, cancelled: 0, revenue: 0 },
      items: [],
      total: 0,
      totalPages: 0,
    });
    expect(t.airlineModel.find).not.toHaveBeenCalled();
    expect(t.hotelModel.find).not.toHaveBeenCalled();
  });

  it('pages 10 providers at a time but summarises all of them', async () => {
    const hotelGroups = Array.from({ length: 12 }, (_, i) =>
      group(`h${i}`, 'CONFIRMED', 1, 100 + i),
    );
    const t = setup({ hotelGroups, hotels: [] });
    const page2 = await t.service.providerAnalytics({ page: 2 });
    expect(page2.items).toHaveLength(2);
    expect(page2).toMatchObject({ total: 12, totalPages: 2 });
    expect(page2.summary).toMatchObject({ bookings: 12, revenue: 1266 });
  });

  it('names a deleted provider as unknown', async () => {
    const t = setup({
      hotelGroups: [group('gone', 'CONFIRMED', 1, 10)],
      hotels: [],
    });
    const result = await t.service.providerAnalytics({ page: 1 });
    expect(result.items[0].name).toBe('Unknown provider');
  });
});
