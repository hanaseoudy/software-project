import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBudgetEntryDto } from './create-budget-entry.dto';
import { UpdateBudgetEntryDto } from './update-budget-entry.dto';
import { BudgetCategory } from '../schemas/budget-entry.schema';
describe('ITN-14 DTOs', () => {
  const valid = {
    category: 'FOOD',
    amount: 0,
    currency: ' usd ',
    description: ' Lunch ',
  };
  it.each(Object.values(BudgetCategory))(
    'accepts category %s and normalizes currency/description',
    async (category) => {
      const dto = plainToInstance(CreateBudgetEntryDto, { ...valid, category });
      expect(await validate(dto)).toEqual([]);
      expect(dto.currency).toBe('USD');
      expect(dto.description).toBe('Lunch');
    },
  );
  it.each(['category', 'amount', 'currency'])(
    'requires nonnull %s',
    async (field) => {
      for (const value of [undefined, null])
        expect(
          (
            await validate(
              plainToInstance(CreateBudgetEntryDto, {
                ...valid,
                [field]: value,
              }),
            )
          ).length,
        ).toBeGreaterThan(0);
    },
  );
  it.each(['category', 'amount', 'currency', 'description'])(
    'rejects PATCH null for %s',
    async (field) => {
      expect(
        (
          await validate(
            plainToInstance(UpdateBudgetEntryDto, { [field]: null }),
          )
        ).length,
      ).toBeGreaterThan(0);
    },
  );
  it.each([
    { amount: -1 },
    { amount: NaN },
    { amount: Infinity },
    { amount: '1' },
    { amount: 0.001 },
    { category: 'food' },
    { category: 'INTERCITY_TRANSPORT' },
    { currency: 'US' },
    { currency: 1 },
    { description: null },
  ])('rejects %j', async (change) => {
    expect(
      (
        await validate(
          plainToInstance(CreateBudgetEntryDto, { ...valid, ...change }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it('accepts positive amounts, omitted description and partial updates', async () => {
    expect(
      await validate(
        plainToInstance(CreateBudgetEntryDto, {
          category: 'ACTIVITIES',
          amount: 1.25,
          currency: 'EUR',
        }),
      ),
    ).toEqual([]);
    expect(
      await validate(plainToInstance(UpdateBudgetEntryDto, { amount: 0 })),
    ).toEqual([]);
  });
});
