import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  BudgetCategory,
  BudgetEntryDocument,
} from '../schemas/budget-entry.schema';
export class BudgetEntryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() dayId!: string;
  @ApiProperty({ enum: BudgetCategory }) category!: BudgetCategory;
  @ApiPropertyOptional() description?: string;
  @ApiProperty({ minimum: 0 }) amount!: number;
  @ApiProperty({ example: 'USD' }) currency!: string;
  static from(entry: BudgetEntryDocument): BudgetEntryResponseDto {
    return {
      id: entry._id.toString(),
      dayId: entry.dayId.toString(),
      category: entry.category,
      ...(entry.description === undefined
        ? {}
        : { description: entry.description }),
      amount: entry.amount,
      currency: entry.currency,
    };
  }
}
