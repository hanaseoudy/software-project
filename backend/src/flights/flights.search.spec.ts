import { Types } from 'mongoose';
import { FlightsService } from './flights.service';
import { CabinClass } from '../airlines/schemas/airline.schema';
import {
  FlightSortBy,
  SearchFlightsDto,
  SortFlightOrder,
} from './dto/search-flights.dto';

describe('FLT-11/12 legacy and ITN-26 shared flight search', () => {
  const airport = (iataCode: string) => ({
    _id: new Types.ObjectId(),
    iataCode,
    timezone: iataCode === 'CAI' ? 'Africa/Cairo' : 'Europe/London',
  });
  const ports = ['CAI', 'LHR', 'LGW', 'STN'].map(airport),
    byCode = new Map(ports.map((p) => [p.iataCode, p]));
  const cabin = (price = 100, free = 9, cabinClass = CabinClass.ECONOMY) => ({
    _id: new Types.ObjectId(),
    cabinClass,
    totalSeats: free + 2,
    bookedSeats: 1,
    heldSeats: 1,
    price,
  });
  const flight = (code: string, price = 100, reverse = false) => ({
    _id: new Types.ObjectId(),
    flightNumber: 'SAME-NUMBER',
    airline: { _id: new Types.ObjectId(), isActive: true },
    departureAirport: byCode.get(reverse ? code : 'CAI')!,
    arrivalAirport: byCode.get(reverse ? 'CAI' : code)!,
    departureTime: new Date('2040-12-05T08:00:00Z'),
    arrivalTime: new Date('2040-12-05T11:00:00Z'),
    departureLocalDate: '2040-12-05',
    durationMinutes: 180,
    cabins: [cabin(price)],
  });
  let rows: ReturnType<typeof flight>[],
    model: { find: jest.Mock },
    airports: { findOne: jest.Mock; find: jest.Mock },
    service: FlightsService;
  const dto = (change: Partial<SearchFlightsDto> = {}): SearchFlightsDto => ({
    departureAirport: 'CAI',
    arrivalAirport: 'LHR',
    departureDate: '2040-12-05',
    adults: 1,
    children: 0,
    infants: 0,
    ...change,
  });
  beforeEach(() => {
    rows = [flight('LHR', 300), flight('LGW', 100), flight('STN', 200)];
    const contains = (predicate: unknown, id: Types.ObjectId) =>
      typeof predicate === 'object' && predicate !== null && '$in' in predicate
        ? (predicate.$in as Types.ObjectId[]).some((value) => value.equals(id))
        : id.equals(predicate as Types.ObjectId);
    model = {
      find: jest.fn((query) => {
        const found = rows.filter(
          (row) =>
            contains(query.departureAirport, row.departureAirport._id) &&
            contains(query.arrivalAirport, row.arrivalAirport._id),
        );
        return {
          populate: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue(found),
        };
      }),
    };
    airports = {
      findOne: jest.fn(({ iataCode }) => Promise.resolve(byCode.get(iataCode))),
      find: jest.fn(({ iataCode }) => ({
        lean: jest
          .fn()
          .mockResolvedValue(
            ports.filter((port) => iataCode.$in.includes(port.iataCode)),
          ),
      })),
    };
    service = new FlightsService(
      model as never,
      airports as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });
  it('preserves the single-pair legacy array contract and local/UTC formatting', async () => {
    rows = Array.from({ length: 12 }, () => flight('LHR'));
    const result = await service.search(dto());
    expect(Array.isArray(result.outbound)).toBe(true);
    expect(result.outbound).toHaveLength(12);
    expect(result).not.toHaveProperty('return');
    expect(result.outbound[0]).toMatchObject({
      departureTime: new Date('2040-12-05T08:00:00Z'),
      departureLocalTime: '2040-12-05T10:00:00',
      departureTimezone: 'Africa/Cairo',
      arrivalLocalTime: '2040-12-05T11:00:00',
      cabins: [{ fare: 100, totalPrice: 100, seatsRemaining: 9 }],
    });
    expect(airports.findOne).toHaveBeenCalledWith({ iataCode: 'CAI' });
    expect(airports.findOne).toHaveBeenCalledWith({ iataCode: 'LHR' });
    expect(airports.find).not.toHaveBeenCalled();
  });
  it('keeps legacy round-trip legs in reverse airport direction', async () => {
    rows.push(flight('LHR', 80, true));
    const result = await service.search(dto({ returnDate: '2040-12-05' }));
    expect(result.outbound).toHaveLength(1);
    expect(result.return).toHaveLength(1);
    expect(result.return![0].departureAirport.iataCode).toBe('LHR');
  });
  it('searches three city airports with one flight query and globally sorts all matches', async () => {
    const result = await service.searchToAirports(
      dto({ sortBy: FlightSortBy.PRICE }),
      ['LHR', 'LGW', 'STN'],
    );
    expect(result.outbound.map((f) => f.cabins[0].fare)).toEqual([
      100, 200, 300,
    ]);
    expect(model.find).toHaveBeenCalledTimes(1);
    expect(airports.find).toHaveBeenCalledTimes(1);
    expect(model.find.mock.calls[0][0]).toMatchObject({
      arrivalAirport: {
        $in: expect.arrayContaining(ports.slice(1).map((p) => p._id)),
      },
      status: 'SCHEDULED',
      departureLocalDate: '2040-12-05',
      departureTime: { $gt: expect.any(Date) },
    });
  });
  it('uses eligible city departure airports for the return leg, targeting only the selected origin', async () => {
    rows.push(...['LHR', 'LGW', 'STN'].map((code) => flight(code, 100, true)));
    const result = await service.searchToAirports(
      dto({ returnDate: '2040-12-05' }),
      ['LHR', 'LGW', 'STN'],
    );
    expect(result.return).toHaveLength(3);
    expect(
      result.return!.every((f) => f.arrivalAirport.iataCode === 'CAI'),
    ).toBe(true);
    expect(model.find.mock.calls[1][0]).toMatchObject({
      departureAirport: {
        $in: expect.arrayContaining(ports.slice(1).map((p) => p._id)),
      },
      arrivalAirport: { $in: [ports[0]._id] },
    });
  });
  it('deduplicates by actual flight _id, not flight number or populated object identity', async () => {
    rows = [
      rows[0],
      { ...rows[0], _id: new Types.ObjectId(rows[0]._id.toString()) },
      rows[1],
    ];
    const result = await service.searchToAirports(dto(), ['LHR', 'LGW', 'LHR']);
    expect(result.outbound).toHaveLength(2);
    expect(new Set(result.outbound.map((f) => String(f._id))).size).toBe(2);
  });
  it('uses stable _id ties for the new multi-airport search only', async () => {
    rows.forEach((row) => (row.cabins[0].price = 100));
    rows.reverse();
    const result = await service.searchToAirports(
      dto({ sortBy: FlightSortBy.PRICE, sortOrder: SortFlightOrder.DESC }),
      ['LHR', 'LGW', 'STN'],
    );
    expect(result.outbound.map((f) => String(f._id))).toEqual(
      rows.map((f) => String(f._id)).sort(),
    );
  });
  it.each([
    FlightSortBy.PRICE,
    FlightSortBy.DURATION,
    FlightSortBy.DEPARTURE_TIME,
  ])('shares %s sorting between legacy and city search', async (sortBy) => {
    rows = [flight('LHR', 100), flight('LHR', 200)];
    rows[1].durationMinutes = 240;
    rows[1].departureTime = new Date('2040-12-05T09:00:00Z');
    const query = dto({ sortBy, sortOrder: SortFlightOrder.DESC });
    expect((await service.searchToAirports(query, ['LHR'])).outbound).toEqual(
      (await service.search(query)).outbound,
    );
  });
  it('reuses cabin availability and exact adult/child/infant pricing', async () => {
    rows = [flight('LHR', 12.34)];
    const query = dto({ adults: 2, children: 1, infants: 1 });
    const legacy = await service.search(query),
      city = await service.searchToAirports(query, ['LHR']);
    expect(city).toEqual(legacy);
    expect(city.outbound[0].cabins[0]).toMatchObject({
      fare: 12.34,
      totalPrice: 38.25,
      seatsRemaining: 9,
    });
    rows[0].cabins[0].heldSeats = 9;
    expect((await service.searchToAirports(query, ['LHR'])).outbound).toEqual(
      [],
    );
  });
  it('shares inclusive price and cabin filters and active-airline exclusion', async () => {
    rows[0].cabins.push(cabin(150, 9, CabinClass.BUSINESS));
    rows[1].airline.isActive = false;
    const result = await service.searchToAirports(
      dto({ cabinClass: CabinClass.BUSINESS, minPrice: 150, maxPrice: 150 }),
      ['LHR', 'LGW', 'STN'],
    );
    expect(result.outbound).toHaveLength(1);
    expect(result.outbound[0].cabins).toHaveLength(1);
    expect(result.outbound[0].cabins[0].fare).toBe(150);
  });
  it.each([
    { infants: 2 },
    { returnDate: '2040-12-04' },
    { minPrice: 200, maxPrice: 100 },
  ])('preserves legacy validation for %j', async (change) => {
    await expect(service.search(dto(change))).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      service.searchToAirports(dto(change), ['LHR']),
    ).rejects.toMatchObject({ status: 400 });
    expect(model.find).not.toHaveBeenCalled();
  });
  it('keeps unknown airport errors and empty-city results explicit', async () => {
    await expect(
      service.search(dto({ arrivalAirport: 'XXX' })),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.searchToAirports(dto(), ['XXX']),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      await service.searchToAirports(dto({ returnDate: '2040-12-05' }), []),
    ).toEqual({ outbound: [], return: [] });
    expect(await service.searchToAirports(dto(), ['CAI'])).toEqual({
      outbound: [],
    });
  });
});
