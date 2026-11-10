import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsMongoId, IsString, Length } from 'class-validator';
import { ReportTargetType } from '../enums/report.enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// GEN-09: POST /api/reports body
export class CreateReportDto {
  @ApiProperty({ enum: ReportTargetType, example: ReportTargetType.POST })
  @IsEnum(ReportTargetType, { message: 'Target type must be post, comment, review or itinerary' })
  targetType!: ReportTargetType;

  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60711', description: 'Id of the reported item' })
  @IsMongoId({ message: 'Target id must be a valid id' })
  targetId!: string;

  @ApiProperty({ example: 'This post contains offensive language.', minLength: 5, maxLength: 500 })
  @Transform(trim)
  @IsString({ message: 'Reason must be text' })
  @Length(5, 500, { message: 'Reason must be between 5 and 500 characters' })
  reason!: string;
}
