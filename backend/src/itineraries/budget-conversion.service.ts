import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Currency,
  CurrencyDocument,
} from '../reference-data/schemas/currency.schema';
import { SupportedCurrency } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { BudgetEntriesService } from './budget-entries.service';
import {
  BudgetExchangeRateDetailsDto,
  ConvertedBudgetSummaryResponseDto,
} from './dto/converted-budget-summary-response.dto';
import { BudgetCategoryTotalsDto } from './dto/itinerary-budget-totals-response.dto';
import { ExchangeRatesService } from './exchange-rates.service';
import { BudgetCategory } from './schemas/budget-entry.schema';

const categories = [
  ...Object.values(BudgetCategory),
  'INTERCITY_TRANSPORT',
] as const;
type Category = keyof BudgetCategoryTotalsDto;
type BudgetCents = Record<Category, bigint>;

function emptyCategories(): BudgetCents {
  return {
    FOOD: 0n,
    ACCOMMODATION: 0n,
    IN_CITY_TRANSPORT: 0n,
    ACTIVITIES: 0n,
    INTERCITY_TRANSPORT: 0n,
  };
}

// Provider rates are validated positive decimal strings, possibly in scientific notation.
function decimalRatio(rate: string) {
  const [mantissa, exponent = '0'] = rate.split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const digits = BigInt(whole + fraction);
  const scale = Number(exponent) - fraction.length;
  return scale >= 0
    ? { numerator: digits * 10n ** BigInt(scale), denominator: 1n }
    : { numerator: digits, denominator: 10n ** BigInt(-scale) };
}

function exactAmount(cents: bigint): number {
  if (cents <= BigInt(Number.MAX_SAFE_INTEGER)) {
    const amount = Number(cents) / 100;
    const serialized = decimalRatio(String(amount));
    if (100n * serialized.numerator === cents * serialized.denominator) {
      return amount;
    }
  }
  throw new ConflictException(
    'Converted budget exceeds safe monetary precision',
  );
}

function formatTotals(cents: BudgetCents) {
  return {
    total: exactAmount(
      categories.reduce((sum, category) => sum + cents[category], 0n),
    ),
    byCategory: {
      FOOD: exactAmount(cents.FOOD),
      ACCOMMODATION: exactAmount(cents.ACCOMMODATION),
      IN_CITY_TRANSPORT: exactAmount(cents.IN_CITY_TRANSPORT),
      ACTIVITIES: exactAmount(cents.ACTIVITIES),
      INTERCITY_TRANSPORT: exactAmount(cents.INTERCITY_TRANSPORT),
    },
  };
}

@Injectable()
export class BudgetConversionService {
  constructor(
    private readonly budgets: BudgetEntriesService,
    private readonly users: UsersService,
    private readonly exchangeRates: ExchangeRatesService,
    @InjectModel(Currency.name)
    private readonly currencies: Model<CurrencyDocument>,
  ) {}

  async totals(
    userId: string,
    itineraryId: string,
  ): Promise<ConvertedBudgetSummaryResponseDto> {
    // Native totals close their snapshot before any provider request. They
    // also enforce ownership for both PRIVATE and PUBLIC itineraries.
    const native = await this.budgets.totals(userId, itineraryId);
    const { preferredCurrency: currency } = await this.users.getProfile(userId);
    const supported = await this.currencies
      .distinct('code')
      .read('primary')
      .exec();
    const supportedCodes = new Set(supported);
    if (
      !Object.values(SupportedCurrency).includes(currency) ||
      !supportedCodes.has(currency)
    ) {
      throw new ConflictException('Preferred currency is not supported');
    }

    const sources = native.totals
      .filter((entry) => entry.currency !== currency && entry.total > 0)
      .map((entry) => entry.currency);
    if (sources.some((source) => !supportedCodes.has(source))) {
      throw new ConflictException('Existing budget currency is not supported');
    }
    const rates = sources.length
      ? await this.exchangeRates.getRates(supported, sources, currency)
      : null;
    const exchangeRates: BudgetExchangeRateDetailsDto = rates
      ? {
          status: rates.status,
          rateDate: rates.rateDate,
          provider: 'FXRatesAPI',
        }
      : { status: 'not_required', rateDate: null, provider: null };

    const factors = new Map<string, ReturnType<typeof decimalRatio>>();
    if (rates) {
      const target = decimalRatio(rates.rates[currency]);
      for (const source of sources) {
        const from = decimalRatio(rates.rates[source]);
        factors.set(source, {
          numerator: target.numerator * from.denominator,
          denominator: target.denominator * from.numerator,
        });
      }
    }

    const overall = emptyCategories();
    const days = native.days.map(({ dayId, dayNumber, date, totals }) => {
      const daily = emptyCategories();
      for (const entry of totals) {
        const factor = factors.get(entry.currency);
        for (const category of categories) {
          let cents = BigInt(
            entry.byCategory[category].toFixed(2).replace('.', ''),
          );
          if (factor && cents) {
            // All amounts are non-negative. Round half up once per bucket.
            const { numerator, denominator } = factor;
            cents = (2n * cents * numerator + denominator) / (2n * denominator);
          }
          daily[category] += cents;
          overall[category] += cents;
        }
      }
      return { dayId, dayNumber, date, ...formatTotals(daily) };
    });
    return {
      ...native,
      converted: { currency, ...formatTotals(overall), days, exchangeRates },
    };
  }
}
