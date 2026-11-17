import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Types } from 'mongoose';
import { CreateTransportCostDto } from './create-transport-cost.dto';
import { UpdateTransportCostDto } from './update-transport-cost.dto';
import { IntercityTransportMode } from '../schemas/transport-cost.schema';

describe('ITN-16 request DTOs', () => {
  const valid = {
    dayId: new Types.ObjectId().toString(),
    mode: 'TRAIN',
    fromCityId: ' cairo ',
    toCityId: 'new_york',
    amount: 0,
    currency: 'usd',
  };
  it.each(Object.values(IntercityTransportMode))(
    'accepts mode %s and normalizes reference strings',
    async (mode) => {
      const dto = plainToInstance(CreateTransportCostDto, { ...valid, mode });
      expect(await validate(dto)).toEqual([]);
      expect(dto).toMatchObject({
        fromCityId: 'cairo',
        currency: 'USD',
        amount: 0,
      });
    },
  );
  it.each(['dayId', 'mode', 'fromCityId', 'toCityId', 'amount', 'currency'])(
    'requires non-null %s',
    async (field) => {
      for (const value of [undefined, null])
        expect(
          (
            await validate(
              plainToInstance(CreateTransportCostDto, {
                ...valid,
                [field]: value,
              }),
            )
          ).length,
        ).toBeGreaterThan(0);
      expect(
        (
          await validate(
            plainToInstance(UpdateTransportCostDto, { [field]: null }),
          )
        ).length,
      ).toBeGreaterThan(0);
    },
  );
  it.each([
    { dayId: 'bad' },
    { dayId: 1 },
    { mode: 'train' },
    { mode: 'TAXI' },
    { mode: 1 },
    { fromCityId: '' },
    { fromCityId: '  ' },
    { fromCityId: {} },
    { toCityId: [] },
    { amount: -1 },
    { amount: '12' },
    { amount: 1.234 },
    { amount: NaN },
    { amount: Infinity },
    { amount: false },
    { currency: 'US' },
    { currency: 10 },
  ])('rejects invalid values: %j', async (values) => {
    expect(
      (
        await validate(
          plainToInstance(CreateTransportCostDto, { ...valid, ...values }),
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (await validate(plainToInstance(UpdateTransportCostDto, values))).length,
    ).toBeGreaterThan(0);
  });
  it('allows omissions on PATCH while the service rejects an empty request', async () => {
    expect(
      await validate(plainToInstance(UpdateTransportCostDto, { amount: 12.5 })),
    ).toEqual([]);
    expect(await validate(plainToInstance(UpdateTransportCostDto, {}))).toEqual(
      [],
    );
  });
});
