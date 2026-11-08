import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateCancellationTiersDto } from './update-cancellation-tiers.dto';

const check = async (body: Record<string, unknown>) =>
  validate(plainToInstance(UpdateCancellationTiersDto, body));

describe('UpdateCancellationTiersDto', () => {
  it('accepts a list, including an empty one', async () => {
    expect(await check({ tiers: [] })).toEqual([]);
    expect(
      await check({ tiers: [{ daysBeforeCheckIn: 7, refundPercentage: 50 }] }),
    ).toEqual([]);
  });

  it('rejects a missing or non-list tiers value', async () => {
    expect((await check({})).map((e) => e.property)).toEqual(['tiers']);
    expect((await check({ tiers: 'x' })).map((e) => e.property)).toEqual([
      'tiers',
    ]);
  });

  it('rejects more than 20 tiers', async () => {
    const tiers = Array.from({ length: 21 }, (_, i) => ({
      daysBeforeCheckIn: i,
      refundPercentage: 0,
    }));
    expect((await check({ tiers })).map((e) => e.property)).toEqual(['tiers']);
  });
});
