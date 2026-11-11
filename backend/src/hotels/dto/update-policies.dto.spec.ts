import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePoliciesDto } from './update-policies.dto';

const check = (body: object) =>
  validate(plainToInstance(UpdatePoliciesDto, body));

describe('UpdatePoliciesDto', () => {
  it('accepts any single field or all of them', async () => {
    expect(await check({ checkInTime: '14:00' })).toHaveLength(0);
    expect(await check({ cancellationTiers: [] })).toHaveLength(0);
    expect(
      await check({
        checkInTime: '14:00',
        checkOutTime: '12:00',
        cancellationTiers: [{ daysBeforeCheckIn: 1, refundPercentage: 10 }],
      }),
    ).toHaveLength(0);
  });

  it('rejects a bad time, null and a non-list', async () => {
    expect(await check({ checkInTime: '25:00' })).toHaveLength(1);
    expect(await check({ checkOutTime: null })).toHaveLength(1);
    expect(await check({ cancellationTiers: 'x' })).toHaveLength(1);
  });

  it('rejects more than 20 tiers', async () => {
    const tiers = Array.from({ length: 21 }, (_, i) => ({
      daysBeforeCheckIn: i,
      refundPercentage: 0,
    }));
    expect(await check({ cancellationTiers: tiers })).toHaveLength(1);
  });
});
