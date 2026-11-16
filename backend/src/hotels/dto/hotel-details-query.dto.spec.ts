import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { HotelDetailsQueryDto } from './hotel-details-query.dto';

const failing = async (query: Record<string, unknown>) =>
  (await validate(plainToInstance(HotelDetailsQueryDto, query))).map(
    (e) => e.property,
  );

describe('HotelDetailsQueryDto', () => {
  it('accepts no dates', async () => {
    expect(await failing({})).toEqual([]);
  });

  it('accepts check-in and check-out as text', async () => {
    expect(
      await failing({ checkIn: '2026-12-10', checkOut: '2026-12-13' }),
    ).toEqual([]);
  });

  it('rejects dates that are not text', async () => {
    expect(await failing({ checkIn: 5 })).toEqual(['checkIn']);
    expect(await failing({ checkOut: true })).toEqual(['checkOut']);
  });
});
