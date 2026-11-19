import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ItineraryFlightSearchQueryDto } from './itinerary-flight-search-query.dto';
describe('ITN-26 query DTO', () => {
  const valid = { departureAirport: ' cai ', adults: '1' };
  it('inherits legacy passenger/filter normalization and itinerary defaults', async () => {
    const dto = plainToInstance(ItineraryFlightSearchQueryDto, valid);
    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({
      departureAirport: 'CAI',
      adults: 1,
      children: 0,
      infants: 0,
      tripType: 'ONE_WAY',
      outboundPage: 1,
      sortBy: 'departureTime',
      sortOrder: 'asc',
    });
    expect(dto.returnPage).toBeUndefined();
  });
  it('accepts explicit round-trip dates and supported filters/pages', async () => {
    const dto = plainToInstance(ItineraryFlightSearchQueryDto, {
      ...valid,
      tripType: 'ROUND_TRIP',
      departureDate: '2040-02-29',
      returnDate: '2040-03-01',
      cabinClass: 'ECONOMY',
      children: '1',
      infants: '1',
      minPrice: '0',
      maxPrice: '200',
      sortBy: 'price',
      sortOrder: 'desc',
      outboundPage: '2',
      returnPage: '3',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({ outboundPage: 2, returnPage: 3, minPrice: 0 });
  });
  it.each(['departureAirport', 'adults'])('requires %s', async (field) => {
    expect(
      (
        await validate(
          plainToInstance(ItineraryFlightSearchQueryDto, {
            ...valid,
            [field]: undefined,
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it.each([
    { tripType: 'BAD' },
    { departureAirport: 'CAIRO' },
    { adults: 0 },
    { adults: 10 },
    { adults: 1.5 },
    { adults: 'bad' },
    { children: -1 },
    { infants: 10 },
    { cabinClass: 'BAD' },
    { minPrice: -1 },
    { maxPrice: 'Infinity' },
    { sortBy: 'bad' },
    { sortOrder: 'up' },
    { departureDate: '2040/01/01' },
    { outboundPage: 0 },
    { outboundPage: 1.5 },
    { outboundPage: 'bad' },
    { returnPage: -1 },
    { returnPage: Number.MAX_SAFE_INTEGER },
  ])('rejects %j', async (change) => {
    expect(
      (
        await validate(
          plainToInstance(ItineraryFlightSearchQueryDto, {
            ...valid,
            ...change,
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
