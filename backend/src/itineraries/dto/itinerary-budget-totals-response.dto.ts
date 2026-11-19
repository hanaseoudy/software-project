import { ApiProperty } from '@nestjs/swagger';
export class BudgetCategoryTotalsDto {
  @ApiProperty({ minimum: 0 }) FOOD!: number;
  @ApiProperty({ minimum: 0 }) ACCOMMODATION!: number;
  @ApiProperty({ minimum: 0 }) IN_CITY_TRANSPORT!: number;
  @ApiProperty({ minimum: 0 }) ACTIVITIES!: number;
  @ApiProperty({
    minimum: 0,
    description:
      'Response-only category for ITN-16; not a budget-entry category',
  })
  INTERCITY_TRANSPORT!: number;
}
export class BudgetCurrencyTotalDto {
  @ApiProperty({ example: 'USD' }) currency!: string;
  @ApiProperty({ minimum: 0 }) total!: number;
  @ApiProperty({ type: BudgetCategoryTotalsDto })
  byCategory!: BudgetCategoryTotalsDto;
}
export class BudgetDayTotalDto {
  @ApiProperty() dayId!: string;
  @ApiProperty() dayNumber!: number;
  @ApiProperty({ type: String, format: 'date' }) date!: string;
  @ApiProperty({ type: [BudgetCurrencyTotalDto] })
  totals!: BudgetCurrencyTotalDto[];
}
export class ItineraryBudgetTotalsResponseDto {
  @ApiProperty() itineraryId!: string;
  @ApiProperty({ type: [BudgetCurrencyTotalDto] })
  totals!: BudgetCurrencyTotalDto[];
  @ApiProperty({ type: [BudgetDayTotalDto] }) days!: BudgetDayTotalDto[];
}
