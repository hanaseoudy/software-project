import { Types } from 'mongoose';
import { ItineraryFlightsService } from './itinerary-flights.service';
import {
  ItineraryFlightSearchQueryDto,
  ItineraryTripType,
} from './dto/itinerary-flight-search-query.dto';
import { airports } from '../reference-data/reference-data.data';

describe('ITN-26 owned snapshot resolution and pagination', () => {
  const owner = new Types.ObjectId().toString(),
    id = new Types.ObjectId();
  const chain = (value: unknown) => ({
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    session: jest.fn().mockReturnThis(),
    read: jest.fn().mockReturnThis(),
    maxTimeMS: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  });
  let parent: { findOne: jest.Mock },
    days: { find: jest.Mock },
    cities: { findOne: jest.Mock },
    ports: { find: jest.Mock },
    connection: { startSession: jest.Mock },
    session: { endSession: jest.Mock },
    flights: { searchToAirports: jest.Mock },
    service: ItineraryFlightsService;
  let start: Date,
    rows: { _id: Types.ObjectId; dayNumber: number; cityId: string }[],
    records: {
      _id: Types.ObjectId;
      iataCode: string;
      city: string;
      country: string;
      timezone: string;
    }[];
  const query = (
    change: Partial<ItineraryFlightSearchQueryDto> = {},
  ): ItineraryFlightSearchQueryDto => ({
    departureAirport: 'CAI',
    adults: 1,
    ...change,
  });
  beforeEach(() => {
    start = new Date('2040-02-28T00:00:00Z');
    rows = Array.from({ length: 3 }, (_, i) => ({
      _id: new Types.ObjectId(),
      dayNumber: i + 1,
      cityId: 'london',
    }));
    records = airports
      .filter((a) => ['CAI', 'LHR'].includes(a.iata_code))
      .map((a) => ({
        _id: new Types.ObjectId(),
        iataCode: a.iata_code,
        city: a.city_id,
        country: a.country_code,
        timezone: a.time_zone,
      }));
    parent = { findOne: jest.fn(() => chain({ _id: id, startDate: start })) };
    days = { find: jest.fn(() => chain(rows)) };
    cities = {
      findOne: jest.fn(() =>
        chain({
          cityId: rows[0].cityId,
          name: 'London',
          countryCode: rows[0].cityId === 'cairo' ? 'EG' : 'GB',
        }),
      ),
    };
    ports = { find: jest.fn(() => chain(records)) };
    session = { endSession: jest.fn().mockResolvedValue(undefined) };
    connection = { startSession: jest.fn().mockResolvedValue(session) };
    flights = {
      searchToAirports: jest.fn(async (q) => ({
        outbound: Array.from({ length: 13 }, (_, i) => ({
          _id: String(i),
          flightNumber: 'F' + i,
        })),
        ...(q.returnDate ? { return: [{ _id: 'return-flight' }] } : {}),
      })),
    };
    service = new ItineraryFlightsService(
      parent as never,
      days as never,
      cities as never,
      ports as never,
      connection as never,
      flights as never,
    );
  });
  it('resolves current owned first-day city, canonical airports and outbound default before pagination', async () => {
    const result = await service.search(owner, id.toString(), query());
    expect(parent.findOne).toHaveBeenCalledWith({
      _id: id,
      userId: new Types.ObjectId(owner),
    });
    expect(cities.findOne).toHaveBeenCalledWith({ cityId: 'london' });
    expect(flights.searchToAirports).toHaveBeenCalledWith(
      expect.objectContaining({
        departureAirport: 'CAI',
        departureDate: '2040-02-28',
        adults: 1,
        children: 0,
        infants: 0,
      }),
      ['LHR'],
    );
    expect(result.outbound).toMatchObject({
      total: 13,
      page: 1,
      pageSize: 10,
      totalPages: 2,
    });
    expect(result.outbound.items).toHaveLength(10);
    expect(result).not.toHaveProperty('return');
  });
  it('defaults return to last day and paginates legs independently without losing counts', async () => {
    const result = await service.search(
      owner,
      id.toString(),
      query({
        tripType: ItineraryTripType.ROUND_TRIP,
        outboundPage: 2,
        returnPage: 2,
      }),
    );
    expect(flights.searchToAirports).toHaveBeenCalledWith(
      expect.objectContaining({ returnDate: '2040-03-01' }),
      ['LHR'],
    );
    expect(result.outbound.items.map((row) => row.flightNumber)).toEqual([
      'F10',
      'F11',
      'F12',
    ]);
    expect(result.return).toEqual({
      items: [],
      total: 1,
      page: 2,
      pageSize: 10,
      totalPages: 1,
    });
  });
  it.each([
    ['2040-12-31', '2041-01-02'],
    ['2040-02-28', '2040-03-01'],
    ['2040-04-30', '2040-05-02'],
  ])('handles UTC calendar boundary %s', async (input, expected) => {
    start = new Date(input + 'T00:00:00Z');
    await service.search(
      owner,
      id.toString(),
      query({ tripType: ItineraryTripType.ROUND_TRIP }),
    );
    expect(flights.searchToAirports.mock.calls[0][0]).toMatchObject({
      departureDate: input,
      returnDate: expected,
    });
  });
  it('permits same-day round trips on one-day itineraries and explicit date overrides', async () => {
    rows = rows.slice(0, 1);
    await service.search(
      owner,
      id.toString(),
      query({ tripType: ItineraryTripType.ROUND_TRIP }),
    );
    expect(flights.searchToAirports.mock.calls[0][0]).toMatchObject({
      departureDate: '2040-02-28',
      returnDate: '2040-02-28',
    });
    await service.search(
      owner,
      id.toString(),
      query({
        tripType: ItineraryTripType.ROUND_TRIP,
        departureDate: '2041-01-01',
        returnDate: '2041-01-03',
      }),
    );
    expect(flights.searchToAirports.mock.calls[1][0]).toMatchObject({
      departureDate: '2041-01-01',
      returnDate: '2041-01-03',
    });
  });
  it('uses current order/city and changed day count on each request', async () => {
    await service.search(owner, id.toString(), query());
    rows[0].cityId = 'cairo';
    await service.search(
      owner,
      id.toString(),
      query({
        departureAirport: 'LHR',
        tripType: ItineraryTripType.ROUND_TRIP,
      }),
    );
    expect(flights.searchToAirports.mock.calls[1][1]).toEqual(['CAI']);
    rows.pop();
    await service.search(
      owner,
      id.toString(),
      query({ tripType: ItineraryTripType.ROUND_TRIP }),
    );
    expect(flights.searchToAirports.mock.calls[2][0].returnDate).toBe(
      '2040-02-29',
    );
  });
  it('excludes same origin from destination candidates and permits an empty set', async () => {
    rows[0].cityId = 'cairo';
    await service.search(owner, id.toString(), query());
    expect(flights.searchToAirports.mock.calls[0][1]).toEqual([]);
    records = records.filter((a) => a.iataCode === 'CAI');
    rows[0].cityId = 'london';
    await service.search(owner, id.toString(), query());
    expect(flights.searchToAirports.mock.calls[1][1]).toEqual([]);
  });
  it('uses primary snapshot reads and closes its session before flight search', async () => {
    await service.search(owner, id.toString(), query());
    expect(connection.startSession).toHaveBeenCalledWith({
      snapshot: true,
      causalConsistency: false,
    });
    for (const model of [
      parent.findOne,
      days.find,
      cities.findOne,
      ports.find,
    ]) {
      const q = model.mock.results[0].value;
      expect(q.session).toHaveBeenCalledWith(session);
      expect(q.read).toHaveBeenCalledWith('primary');
      expect(q.maxTimeMS).toHaveBeenCalledWith(5000);
    }
    expect(session.endSession.mock.invocationCallOrder[0]).toBeLessThan(
      flights.searchToAirports.mock.invocationCallOrder[0],
    );
  });
  it.each([
    { departureAirport: 'XXX' },
    { tripType: 'BAD' },
    { departureDate: '2040-02-30' },
    { returnDate: '2040-02-30', tripType: 'ROUND_TRIP' },
    { returnDate: '2040-03-01' },
    { returnPage: 1 },
  ])('rejects invalid query %j', async (change) => {
    await expect(
      service.search(owner, id.toString(), query(change as never)),
    ).rejects.toMatchObject({ status: 400 });
    expect(flights.searchToAirports).not.toHaveBeenCalled();
  });
  it('rejects invalid parent ID without database access', async () => {
    await expect(service.search(owner, 'bad', query())).rejects.toMatchObject({
      status: 400,
    });
    expect(connection.startSession).not.toHaveBeenCalled();
  });
  it('rejects an overridden departure after the default return', async () => {
    await expect(
      service.search(
        owner,
        id.toString(),
        query({
          tripType: ItineraryTripType.ROUND_TRIP,
          departureDate: '2041-01-01',
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(flights.searchToAirports).not.toHaveBeenCalled();
  });
  it.each(['parent', 'empty'])(
    'returns 404 for unavailable %s without searching flights',
    async (kind) => {
      if (kind === 'parent') parent.findOne.mockReturnValue(chain(null));
      else days.find.mockReturnValue(chain([]));
      await expect(
        service.search(owner, id.toString(), query()),
      ).rejects.toMatchObject({ status: 404 });
      expect(flights.searchToAirports).not.toHaveBeenCalled();
      expect(session.endSession).toHaveBeenCalled();
    },
  );
  it.each(['numbering', 'city', 'airport-mapping', 'airport-missing', 'start'])(
    'rejects stale/corrupt %s data',
    async (kind) => {
      if (kind === 'numbering') rows[1].dayNumber = 4;
      if (kind === 'city') cities.findOne.mockReturnValue(chain(null));
      if (kind === 'airport-mapping') records[1].city = 'cairo';
      if (kind === 'airport-missing')
        records = records.filter((p) => p.iataCode !== 'CAI');
      if (kind === 'start') start = new Date(NaN);
      await expect(
        service.search(owner, id.toString(), query()),
      ).rejects.toMatchObject({
        status: kind === 'airport-missing' ? 400 : 409,
      });
      expect(flights.searchToAirports).not.toHaveBeenCalled();
    },
  );
  it.each([50, 239, 246])(
    'fails closed on snapshot error %s and releases the session',
    async (code) => {
      const q = chain(null);
      q.lean.mockRejectedValue(
        Object.assign(new Error('Unavailable'), { code }),
      );
      parent.findOne.mockReturnValue(q);
      await expect(
        service.search(owner, id.toString(), query()),
      ).rejects.toMatchObject({ status: 503 });
      expect(session.endSession).toHaveBeenCalled();
    },
  );
});
