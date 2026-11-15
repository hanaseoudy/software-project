import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsMongoId, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { REPORT_REASON_MAX_LENGTH, ReportContentType } from '../enums/report.enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// GEN-09: report a post, comment, review or itinerary with a reason
export class CreateReportDto {
  @ApiProperty({ enum: ReportContentType, example: ReportContentType.POST })
  @IsEnum(ReportContentType, { message: 'Content type must be post, comment, review or itinerary' })
  contentType!: ReportContentType;

  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60711', description: 'Id of the reported item (MongoDB ObjectId)' })
  @IsMongoId({ message: 'Content id must be a valid id' })
  contentId!: string;

  @ApiProperty({
    example: 'This post contains spam links',
    minLength: 1,
    maxLength: REPORT_REASON_MAX_LENGTH,
    description: 'Why the item is reported; trimmed, 1 to 500 characters',
  })
  @Transform(trim)
  @IsString({ message: 'Reason must be text' })
  @IsNotEmpty({ message: 'Reason is required' })
  @MaxLength(REPORT_REASON_MAX_LENGTH, { message: `Reason must be at most ${REPORT_REASON_MAX_LENGTH} characters` })
  reason!: string;
}
