import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsNumber,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CancellationRuleDto {
  @ApiProperty({
    example: 14,
    description:
      'Minimum days before departure for this tier (whole number >= 0)',
  })
  @IsInt({ message: 'daysBeforeDeparture must be a whole number' })
  @Min(0, { message: 'daysBeforeDeparture cannot be negative' })
  daysBeforeDeparture: number;

  @ApiProperty({
    example: 100,
    description: 'Refund percentage for this tier (0 to 100)',
  })
  @IsNumber({}, { message: 'refundPercent must be a number' })
  @Min(0, { message: 'refundPercent cannot be less than 0' })
  @Max(100, { message: 'refundPercent cannot exceed 100' })
  refundPercent: number;
}

export class SetCancellationPolicyDto {
  @ApiProperty({
    type: [CancellationRuleDto],
    description:
      'Cancellation tiers with unique daysBeforeDeparture thresholds (empty array means 0% refund)',
    example: [
      { daysBeforeDeparture: 14, refundPercent: 100 },
      { daysBeforeDeparture: 7, refundPercent: 50 },
      { daysBeforeDeparture: 2, refundPercent: 20 },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CancellationRuleDto)
  @ArrayUnique((rule: CancellationRuleDto) => rule.daysBeforeDeparture, {
    message:
      'Each cancellation tier must have a unique daysBeforeDeparture threshold',
  })
  rules: CancellationRuleDto[];
}
