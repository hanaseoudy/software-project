import { Equals, ValidateIf } from 'class-validator';

export class BudgetSummaryQueryDto {
  @ValidateIf((_, value) => value !== undefined)
  @Equals('preferred')
  convert?: 'preferred';
}
