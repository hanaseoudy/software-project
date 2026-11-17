import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateActivityDto } from './create-activity.dto';
import { UpdateActivityDto } from './update-activity.dto';

describe('ITN-10 request validation', () => {
  const valid = {
    name: ' Museum ',
    description: ' Visit ',
    time: '14:30',
    cost: 0,
    currency: 'usd',
  };
  it('trims text and normalizes currency without converting number strings', async () => {
    const dto = plainToInstance(CreateActivityDto, valid);
    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({
      name: 'Museum',
      description: 'Visit',
      currency: 'USD',
      cost: 0,
    });
  });
  it.each([
    { name: undefined },
    { description: undefined },
    { name: '  ' },
    { description: '\n' },
    { name: null },
    { description: null },
    { name: 9 },
    { description: [] },
    { time: '25:99' },
    { time: '14:30\n' },
    { time: '9:00' },
    { time: 1200 },
    { cost: -1 },
    { cost: '12' },
    { cost: 1.234 },
    { cost: NaN },
    { cost: Infinity },
    { currency: 'US' },
    { currency: null },
  ])('rejects invalid create fields: %j', async (changes) => {
    expect(
      (
        await validate(
          plainToInstance(CreateActivityDto, { ...valid, ...changes }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it.each([{ time: null }, { cost: null }, { currency: 'usd' }, {}])(
    'accepts optional omissions/clearing: %j',
    async (changes) => {
      expect(
        await validate(plainToInstance(UpdateActivityDto, changes)),
      ).toEqual([]);
    },
  );
  it.each([
    { name: null },
    { description: null },
    { currency: null },
    { time: false },
    { cost: -0.01 },
  ])('rejects invalid PATCH: %j', async (changes) => {
    expect(
      (await validate(plainToInstance(UpdateActivityDto, changes))).length,
    ).toBeGreaterThan(0);
  });
  it('does not invent a text-length limit', async () => {
    expect(
      await validate(
        plainToInstance(CreateActivityDto, {
          name: 'x'.repeat(10000),
          description: 'y'.repeat(10000),
        }),
      ),
    ).toEqual([]);
  });
});
