import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchHotelsQueryDto } from './search-hotels-query.dto';

const valid = {
  city: '675f1b2c9d3e4a00aabbccdd',
  checkIn: '2026-12-10',
  checkOut: '2026-12-14',
  guests: '3',
};

const failing = async (query: Record<string, unknown>) =>
  (await validate(plainToInstance(SearchHotelsQueryDto, query))).map(
    (e) => e.property,
  );

describe('SearchHotelsQueryDto', () => {
  it('accepts a city search (query values arrive as text)', async () => {
    expect(await failing(valid)).toEqual([]);
  });

  it('accepts a country search with rooms and page', async () => {
    const { city: _city, ...rest } = valid;
    expect(
      await failing({
        ...rest,
        country: '675f1b2c9d3e4a00aabbccee',
        rooms: '2',
        page: '3',
      }),
    ).toEqual([]);
  });

  it('turns the numbers into numbers and defaults rooms to 1', () => {
    const dto = plainToInstance(SearchHotelsQueryDto, valid);
    expect(dto.guests).toBe(3);
    expect(dto.rooms).toBe(1);
    expect(dto.page).toBe(1);
  });

  it.each(['2026-1-10', '10-12-2026', '2026/12/10', 'tomorrow', ''])(
    'rejects "%s" as a check-in date',
    async (value) => {
      expect(await failing({ ...valid, checkIn: value })).toEqual(['checkIn']);
    },
  );

  it('reports every missing required field', async () => {
    expect((await failing({ city: valid.city })).sort()).toEqual([
      'checkIn',
      'checkOut',
      'guests',
    ]);
  });

  it.each(['0', '-1', '1.5', 'abc', ''])('rejects guests = "%s"', async (g) => {
    expect(await failing({ ...valid, guests: g })).toEqual(['guests']);
  });

  it.each(['0', '-2', '1.5', 'abc'])('rejects rooms = "%s"', async (r) => {
    expect(await failing({ ...valid, rooms: r })).toEqual(['rooms']);
  });

  it.each(['not-an-id', '123'])('rejects city = "%s"', async (city) => {
    expect(await failing({ ...valid, city })).toEqual(['city']);
  });

  it('rejects a country that is not an id', async () => {
    expect(await failing({ ...valid, country: 'egypt' })).toEqual(['country']);
  });

  describe('HTL-12 filters and sorting', () => {
    const errorsFor = async (query: Record<string, unknown>) =>
      (await validate(plainToInstance(SearchHotelsQueryDto, { ...valid, ...query }))).flatMap(
        (e) => Object.values(e.constraints ?? {}),
      );

    it('accepts the filters and turns them into numbers', async () => {
      const raw = { minPrice: '100.5', maxPrice: '300', minRating: '3.5', sortBy: 'price', sortOrder: 'desc' };
      expect(await errorsFor(raw)).toEqual([]);
      const dto = plainToInstance(SearchHotelsQueryDto, { ...valid, ...raw });
      expect(dto.minPrice).toBe(100.5);
      expect(dto.maxPrice).toBe(300);
      expect(dto.minRating).toBe(3.5);
    });

    it('defaults the sort order to asc and needs none of the filters', async () => {
      expect(plainToInstance(SearchHotelsQueryDto, valid).sortOrder).toBe('asc');
      expect(await errorsFor({})).toEqual([]);
    });

    it.each(['-1', 'abc', '', 'Infinity'])('rejects "%s" as a price', async (value) => {
      expect(await errorsFor({ minPrice: value })).toEqual(['Minimum price must be a number of 0 or more']);
      expect(await errorsFor({ maxPrice: value })).toEqual(['Maximum price must be a number of 0 or more']);
    });

    it.each(['0', '0.9', '5.1', '6', 'abc', ''])('rejects "%s" as a minimum rating', async (value) => {
      expect(await errorsFor({ minRating: value })).toEqual(['Minimum rating must be a number from 1 to 5']);
    });

    it.each(['1', '5'])('accepts %s as a minimum rating', async (value) => {
      expect(await errorsFor({ minRating: value })).toEqual([]);
    });

    it('rejects an unknown sort field and an unknown sort order', async () => {
      expect(await errorsFor({ sortBy: 'stars' })).toEqual(['Sort by must be price or rating']);
      expect(await errorsFor({ sortOrder: 'up' })).toEqual(['Sort order must be asc or desc']);
    });
  });
});
