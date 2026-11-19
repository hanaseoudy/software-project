import { ApiProperty } from '@nestjs/swagger';
import {
  BudgetCategoryTotalsDto,
  ItineraryBudgetTotalsResponseDto,
} from './itinerary-budget-totals-response.dto';

export class BudgetExchangeRateDetailsDto {
  @ApiProperty({ enum: ['fresh', 'cached_fallback', 'not_required'] })
  status!: 'fresh' | 'cached_fallback' | 'not_required';

  @ApiProperty({ type: String, format: 'date', nullable: true })
  rateDate!: string | null;

  @ApiProperty({ type: String, enum: ['FXRatesAPI'], nullable: true })
  provider!: 'FXRatesAPI' | null;
}

class ConvertedBudgetTotalsDto {
  @ApiProperty({ minimum: 0 })
  total!: number;

  @ApiProperty({ type: BudgetCategoryTotalsDto })
  byCategory!: BudgetCategoryTotalsDto;
}

class ConvertedBudgetDayDto extends ConvertedBudgetTotalsDto {
  @ApiProperty()
  dayId!: string;

  @ApiProperty()
  dayNumber!: number;

  @ApiProperty({ type: String, format: 'date' })
  date!: string;
}

class ConvertedBudgetDto extends ConvertedBudgetTotalsDto {
  @ApiProperty({ example: 'EGP' })
  currency!: string;

  @ApiProperty({ type: [ConvertedBudgetDayDto] })
  days!: ConvertedBudgetDayDto[];

  @ApiProperty({ type: BudgetExchangeRateDetailsDto })
  exchangeRates!: BudgetExchangeRateDetailsDto;
}

export class ConvertedBudgetSummaryResponseDto extends ItineraryBudgetTotalsResponseDto {
  @ApiProperty({ type: ConvertedBudgetDto })
  converted!: ConvertedBudgetDto;
}
