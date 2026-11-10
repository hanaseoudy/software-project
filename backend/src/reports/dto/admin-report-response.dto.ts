import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportAction, ReportTargetType } from '../enums/report.enums';
import { ReportResponseDto } from './report-response.dto';

// GEN-10: one report in the admin list
export class AdminReportItemDto extends ReportResponseDto {
  @ApiProperty({ example: 3, description: 'How many reports with this status the same item has' })
  reportCount!: number;

  @ApiProperty({
    nullable: true,
    example: 'Three days in Luxor: We started the morning at Karnak Temple...',
    description: 'Short preview of the reported content (null if it no longer exists or cannot be read)',
  })
  preview!: string | null;

  @ApiProperty({ example: true, description: 'false if the reported content was deleted or is not available' })
  contentExists!: boolean;
}

export class AdminReportPageDto {
  @ApiProperty({ type: [AdminReportItemDto] })
  items!: AdminReportItemDto[];

  @ApiProperty({ example: 4 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 10, description: 'Always 10' })
  pageSize!: number;

  @ApiProperty({ example: 1 })
  totalPages!: number;
}

// GEN-10: result of hiding / unhiding / deleting content
export class ModerationResultDto {
  @ApiProperty({ enum: ReportTargetType, example: ReportTargetType.POST })
  targetType!: ReportTargetType;

  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60711' })
  targetId!: string;

  @ApiProperty({ enum: [...Object.values(ReportAction), 'unhide'], example: 'hide' })
  action!: ReportAction | 'unhide';

  @ApiPropertyOptional({ example: true, description: 'Present for hide / unhide' })
  isHidden?: boolean;

  @ApiProperty({ example: false })
  deleted!: boolean;

  @ApiProperty({ example: 2, description: 'Open reports on this item that were closed by this action' })
  resolvedReports!: number;
}

// GEN-10: result of resolving a report
export class ResolveReportResultDto {
  @ApiProperty({ type: ReportResponseDto, description: 'The resolved report' })
  report!: ReportResponseDto;

  @ApiProperty({ example: 3, description: 'Open reports on the same item closed by this action (incl. this one)' })
  resolvedReports!: number;

  @ApiPropertyOptional({ type: ModerationResultDto, description: 'What happened to the content (hide / delete)' })
  content?: ModerationResultDto;
}
