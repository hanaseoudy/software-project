import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Types } from 'mongoose';
import { ItineraryHotelSearchQueryDto } from './itinerary-hotel-search-query.dto';

describe('ITN-25 query DTO', () => {
  const valid = {
    groupFirstDayId: new Types.ObjectId().toString(),
    guests: '3',
  };
  it('reuses hotel search transformations/defaults and accepts all filters', async () => {
    const dto = plainToInstance(ItineraryHotelSearchQueryDto, {
      ...valid,
      minPrice: '0',
      maxPrice: '200',
      minRating: '4',
      sortBy: 'price',
      sortOrder: 'desc',
      page: '2',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({
      guests: 3,
      rooms: 1,
      page: 2,
      minPrice: 0,
      maxPrice: 200,
      minRating: 4,
      sortOrder: 'desc',
    });
  });
  it.each(['groupFirstDayId', 'guests'])('requires %s', async (field) => {
    expect(
      (
        await validate(
          plainToInstance(ItineraryHotelSearchQueryDto, {
            ...valid,
            [field]: undefined,
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it.each([
    { groupFirstDayId: 'bad' },
    { groupFirstDayId: ['bad'] },
    { guests: '0' },
    { guests: '-1' },
    { guests: '1.5' },
    { guests: '' },
    { guests: 'NaN' },
    { guests: 'Infinity' },
    { guests: '9007199254740992' },
    { rooms: '0' },
    { rooms: '-1' },
    { rooms: '1.5' },
    { rooms: 'bad' },
    { rooms: ['1', '2'] },
    { page: '0' },
    { page: '1.5' },
    { minPrice: '-1' },
    { maxPrice: '' },
    { minRating: '0' },
    { minRating: '6' },
    { sortBy: 'unknown' },
    { sortOrder: 'up' },
  ])('rejects invalid query %j', async (change) => {
    expect(
      (
        await validate(
          plainToInstance(ItineraryHotelSearchQueryDto, {
            ...valid,
            ...change,
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
