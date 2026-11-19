import { BudgetConversionService } from './budget-conversion.service';
import {
  BudgetCategoryTotalsDto,
  ItineraryBudgetTotalsResponseDto,
} from './dto/itinerary-budget-totals-response.dto';

const categories = (values: Partial<BudgetCategoryTotalsDto> = {}) => ({
  FOOD: 0,
  ACCOMMODATION: 0,
  IN_CITY_TRANSPORT: 0,
  ACTIVITIES: 0,
  INTERCITY_TRANSPORT: 0,
  ...values,
});

function bucket(currency: string, values: Partial<BudgetCategoryTotalsDto>) {
  const byCategory = categories(values);
  return {
    currency,
    total: Object.values(byCategory).reduce((a, b) => a + b, 0),
    byCategory,
  };
}

function summary(
  ...totals: ItineraryBudgetTotalsResponseDto['totals']
): ItineraryBudgetTotalsResponseDto {
  return {
    itineraryId: 'parent',
    totals,
    days: [
      { dayId: 'one', dayNumber: 1, date: '2024-02-29', totals },
      { dayId: 'two', dayNumber: 2, date: '2024-03-01', totals: [] },
    ],
  };
}

describe('ITN-18 budget conversion', () => {
  const budgets = { totals: jest.fn() };
  const users = { getProfile: jest.fn() };
  const rates = { getRates: jest.fn() };
  const exec = jest.fn();
  const currencies = { distinct: jest.fn(() => ({ read: () => ({ exec }) })) };
  const service = new BudgetConversionService(
    budgets as never,
    users as never,
    rates as never,
    currencies as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    currencies.distinct.mockReturnValue({ read: () => ({ exec }) });
    exec.mockResolvedValue(['USD', 'EUR', 'EGP']);
    users.getProfile.mockResolvedValue({ preferredCurrency: 'EUR' });
    rates.getRates.mockResolvedValue({
      rates: { USD: '1', EUR: '0.5', EGP: '2' },
      status: 'fresh',
      rateDate: '2024-02-28',
    });
  });

  it('reconciles all categories across mixed currencies and switches preference on the next request', async () => {
    const native = summary(
      bucket('USD', { FOOD: 0.01, ACTIVITIES: 0.01, ACCOMMODATION: 0.03 }),
      bucket('EUR', { FOOD: 1 }),
      bucket('EGP', { INTERCITY_TRANSPORT: 2, IN_CITY_TRANSPORT: 1 }),
    );
    budgets.totals.mockResolvedValue(native);
    const result = await service.totals('owner', 'parent');
    expect(result.totals).toEqual(native.totals);
    expect(result.days).toEqual(native.days);
    const byCategory = categories({
      FOOD: 1.01,
      ACTIVITIES: 0.01,
      ACCOMMODATION: 0.02,
      INTERCITY_TRANSPORT: 0.5,
      IN_CITY_TRANSPORT: 0.25,
    });
    expect(result.converted).toEqual({
      currency: 'EUR',
      total: 1.79,
      byCategory,
      days: [
        {
          dayId: 'one',
          dayNumber: 1,
          date: '2024-02-29',
          total: 1.79,
          byCategory,
        },
        {
          dayId: 'two',
          dayNumber: 2,
          date: '2024-03-01',
          total: 0,
          byCategory: categories(),
        },
      ],
      exchangeRates: {
        status: 'fresh',
        rateDate: '2024-02-28',
        provider: 'FXRatesAPI',
      },
    });
    expect(rates.getRates).toHaveBeenCalledWith(
      ['USD', 'EUR', 'EGP'],
      ['USD', 'EGP'],
      'EUR',
    );
    users.getProfile.mockResolvedValue({ preferredCurrency: 'USD' });
    expect((await service.totals('owner', 'parent')).converted.total).toBe(
      3.55,
    );
    expect(users.getProfile).toHaveBeenCalledTimes(2);
  });

  it.each([[], [bucket('EGP', { FOOD: 0 })], [bucket('EUR', { FOOD: 1.23 })]])(
    'uses no FX for empty, zero or identity-only totals (%j)',
    (...totals) => {
      // Each row is supplied as one test argument below in the nonempty cases.
      budgets.totals.mockResolvedValue(summary(...totals));
      return expect(service.totals('owner', 'parent'))
        .resolves.toMatchObject({
          converted: {
            total: totals[0]?.total ?? 0,
            exchangeRates: {
              status: 'not_required',
              rateDate: null,
              provider: null,
            },
          },
        })
        .then(() => expect(rates.getRates).not.toHaveBeenCalled());
    },
  );

  it('rejects an unseeded preferred code before touching FX', async () => {
    budgets.totals.mockResolvedValue(summary());
    users.getProfile.mockResolvedValue({ preferredCurrency: 'JPY' });
    await expect(service.totals('owner', 'parent')).rejects.toMatchObject({
      status: 409,
    });
    expect(rates.getRates).not.toHaveBeenCalled();
  });

  it('checks the owned snapshot before touching the account or FX', async () => {
    budgets.totals.mockRejectedValue(new Error('not owned'));
    await expect(service.totals('owner', 'parent')).rejects.toThrow(
      'not owned',
    );
    expect(users.getProfile).not.toHaveBeenCalled();
    expect(rates.getRates).not.toHaveBeenCalled();
  });

  it('fails closed when a converted value exceeds safe precision', async () => {
    budgets.totals.mockResolvedValue(
      summary(bucket('EGP', { FOOD: 100_000_000 })),
    );
    rates.getRates.mockResolvedValue({
      rates: { EUR: '1', EGP: '1e-12' },
      status: 'cached_fallback',
      rateDate: '2024-02-28',
    });
    await expect(service.totals('owner', 'parent')).rejects.toMatchObject({
      status: 409,
    });
  });

  it('rejects a rounded cent that cannot survive JSON number serialization', async () => {
    budgets.totals.mockResolvedValue(
      summary(
        bucket('USD', { FOOD: 0.03 }),
        bucket('EUR', { FOOD: 90_071_992_547_409.89 }),
      ),
    );
    await expect(service.totals('owner', 'parent')).rejects.toMatchObject({
      status: 409,
    });
  });

  it('rounds each day bucket once before summing overall totals', async () => {
    const totals = [bucket('USD', { FOOD: 0.01 })];
    const native = summary(bucket('USD', { FOOD: 0.02 }));
    native.days[0].totals = totals;
    native.days[1].totals = totals;
    budgets.totals.mockResolvedValue(native);
    const { converted } = await service.totals('owner', 'parent');
    expect(converted.days.map((day) => day.total)).toEqual([0.01, 0.01]);
    expect(converted.total).toBe(0.02);
    expect(converted.byCategory.FOOD).toBe(0.02);
  });
});
