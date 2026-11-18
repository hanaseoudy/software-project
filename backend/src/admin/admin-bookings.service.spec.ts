import 'reflect-metadata';
import { AdminBookingsService } from './admin-bookings.service';

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
jest.mock('../flight-bookings/schemas/flight-booking.schema', () => ({
  FlightBooking: { name: 'FlightBooking' },
}));
jest.mock('../hotel-bookings/schemas/hotel-booking.schema', () => ({
  HotelBooking: { name: 'HotelBooking' },
}));
jest.mock('./dto/list-bookings-query.dto', () => ({
  AdminBookingType: { FLIGHT: 'flight', HOTEL: 'hotel' },
}));

const user = {
  _id: 'u1',
  firstName: 'Mariam',
  lastName: 'Test',
  email: 'm@example.com',
};

const flight = (id: string, createdAt: string) => ({
  _id: id,
  user,
  totalPrice: 100,
  baggageFees: 0,
  currency: 'USD',
  status: 'CONFIRMED',
  createdAt: new Date(createdAt),
  outboundFlight: { airline: { name: 'EgyptAir' } },
});

const hotel = (id: string, createdAt: string) => ({
  _id: id,
  user,
  hotel: { name: 'Nile Hotel' },
  checkIn: new Date('2026-12-01'),
  checkOut: new Date('2026-12-04'),
  totalPrice: 300,
  currency: 'USD',
  status: 'CONFIRMED',
  createdAt: new Date(createdAt),
});

/** A chainable stand-in for a mongoose query that resolves to `result` on .lean(). */
function query(result: unknown[]) {
  const q: Record<string, jest.Mock> = {};
  for (const method of ['sort', 'limit', 'populate'])
    q[method] = jest.fn().mockReturnValue(q);
  q.lean = jest.fn().mockResolvedValue(result);
  return q;
}

function setup(
  flights: unknown[] = [],
  hotels: unknown[] = [],
  flightTotal = flights.length,
  hotelTotal = hotels.length,
) {
  const flightQuery = query(flights);
  const hotelQuery = query(hotels);
  const flightBookingModel = {
    find: jest.fn().mockReturnValue(flightQuery),
    countDocuments: jest.fn().mockResolvedValue(flightTotal),
  };
  const hotelBookingModel = {
    find: jest.fn().mockReturnValue(hotelQuery),
    countDocuments: jest.fn().mockResolvedValue(hotelTotal),
  };
  const service = new AdminBookingsService(
    flightBookingModel as never,
    hotelBookingModel as never,
  );
  return {
    service,
    flightBookingModel,
    hotelBookingModel,
    flightQuery,
    hotelQuery,
  };
}

describe('AdminBookingsService.listBookings', () => {
  it('merges flights and hotels, newest first, with the total of both', async () => {
    const { service } = setup(
      [flight('f1', '2026-11-03'), flight('f2', '2026-11-01')],
      [hotel('h1', '2026-11-02')],
      5,
      7,
    );
    const result = await service.listBookings({});
    expect(result.items.map((r) => r.id)).toEqual(['f1', 'h1', 'f2']);
    expect(result).toMatchObject({
      total: 12,
      page: 1,
      pageSize: 10,
      totalPages: 2,
    });
    expect(result.items[0]).toMatchObject({
      type: 'flight',
      provider: 'EgyptAir',
      amount: 100,
    });
  });

  it('only queries flights when type is flight, only hotels when type is hotel', async () => {
    const a = setup([flight('f1', '2026-11-03')]);
    await a.service.listBookings({ type: 'flight' as never });
    expect(a.flightBookingModel.find).toHaveBeenCalled();
    expect(a.hotelBookingModel.find).not.toHaveBeenCalled();

    const b = setup([], [hotel('h1', '2026-11-03')]);
    await b.service.listBookings({ type: 'hotel' as never });
    expect(b.hotelBookingModel.find).toHaveBeenCalled();
    expect(b.flightBookingModel.find).not.toHaveBeenCalled();
  });

  it('filters by status and by creation date range, the same for both types', async () => {
    const { service, flightBookingModel, hotelBookingModel } = setup();
    await service.listBookings({
      status: 'CANCELLED' as never,
      from: '2026-11-01',
      to: '2026-11-30',
    });
    const expected = {
      status: 'CANCELLED',
      createdAt: {
        $gte: new Date('2026-11-01T00:00:00Z'),
        $lt: new Date('2026-12-01T00:00:00Z'),
      },
    };
    expect(flightBookingModel.find).toHaveBeenCalledWith(expected);
    expect(hotelBookingModel.find).toHaveBeenCalledWith(expected);
    expect(flightBookingModel.countDocuments).toHaveBeenCalledWith(expected);
  });

  it('rejects a range where from is after to, without querying', async () => {
    const { service, flightBookingModel } = setup();
    await expect(
      service.listBookings({ from: '2026-11-10', to: '2026-11-01' }),
    ).rejects.toThrow('From must not be after to');
    expect(flightBookingModel.find).not.toHaveBeenCalled();
  });

  it('page 2 skips the first 10 of the merged list and loads 20 of each type', async () => {
    const flights = Array.from({ length: 12 }, (_, i) =>
      flight(
        `f${String(i).padStart(2, '0')}`,
        `2026-11-${String(28 - i).padStart(2, '0')}`,
      ),
    );
    const { service, flightQuery } = setup(flights, [], 12, 0);
    const result = await service.listBookings({ page: 2 });
    expect(flightQuery.limit).toHaveBeenCalledWith(20);
    expect(result.items.map((r) => r.id)).toEqual(['f10', 'f11']);
    expect(result).toMatchObject({ page: 2, total: 12, totalPages: 2 });
  });

  it('is read-only: only find and count are used', async () => {
    const { service, flightBookingModel, hotelBookingModel } = setup();
    await service.listBookings({});
    expect(Object.keys(flightBookingModel).sort()).toEqual([
      'countDocuments',
      'find',
    ]);
    expect(Object.keys(hotelBookingModel).sort()).toEqual([
      'countDocuments',
      'find',
    ]);
  });
});
