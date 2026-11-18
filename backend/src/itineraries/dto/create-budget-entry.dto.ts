import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsString,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BudgetCategory } from '../schemas/budget-entry.schema';
export class CreateBudgetEntryDto {
  @ApiProperty({ enum: BudgetCategory, example: 'FOOD' })
  @IsEnum(BudgetCategory)
  category!: BudgetCategory;

  @ApiPropertyOptional({ example: 'Lunch' })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  description?: string;

  @ApiProperty({
    minimum: 0,
    example: 12.5,
    description: 'Finite nonnegative amount; at most two decimal places',
  })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  amount!: number;

  @ApiProperty({
    example: 'USD',
    description: 'Supported GEN-12 currency, including for zero amounts',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
}
