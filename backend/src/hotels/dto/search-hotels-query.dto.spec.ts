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
});
