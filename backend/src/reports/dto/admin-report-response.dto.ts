import { ApiProperty } from '@nestjs/swagger';
import { PAGE_SIZE } from '../../common/pagination/pagination';
import { ModerationAction, ResolveAction } from '../enums/moderation.enums';
import { ReportContentType, ReportStatus } from '../enums/report.enums';

// Only the reporter's id and display name; never email, password, phone, role or tokens
export class ReporterDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60701' })
  id!: string;

  @ApiProperty({ example: 'Sara Ali', description: '"Deleted user" when the account no longer exists' })
  name!: string;
}

// GEN-10: one row of the admin report queue
export class AdminReportItemDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60730' })
  id!: string;

  @ApiProperty({ enum: ReportContentType, example: ReportContentType.POST })
  contentType!: ReportContentType;

  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60711' })
  contentId!: string;

  @ApiProperty({ example: 'This post contains spam links' })
  reason!: string;

  @ApiProperty({ enum: ReportStatus, example: ReportStatus.OPEN })
  status!: ReportStatus;

  @ApiProperty({ example: '2026-11-14T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ type: ReporterDto })
  reporter!: ReporterDto;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Best street food in Cairo',
    description:
      'Post or itinerary title, or the first 100 characters of a comment or review; ' +
      'null when the content no longer exists',
  })
  contentPreview!: string | null;
}

export class AdminReportsPageDto {
  @ApiProperty({ type: [AdminReportItemDto], description: 'Up to 10 reports, oldest first' })
  items!: AdminReportItemDto[];

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: PAGE_SIZE, description: 'Always 10' })
  pageSize!: number;

  @ApiProperty({ example: 2 })
  totalPages!: number;
}

export class ResolveReportResponseDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60730' })
  id!: string;

  @ApiProperty({ enum: ResolveAction, example: ResolveAction.HIDE })
  action!: ResolveAction;

  @ApiProperty({ enum: [ReportStatus.DISMISSED, ReportStatus.RESOLVED], example: ReportStatus.RESOLVED })
  status!: ReportStatus;

  @ApiProperty({ enum: ReportContentType, example: ReportContentType.POST })
  contentType!: ReportContentType;

  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60711' })
  contentId!: string;

  @ApiProperty({ example: 2, description: 'Other open reports closed with this one (0 for dismiss)' })
  otherReportsResolved!: number;
}

export class ModerationResultDto {
  @ApiProperty({ enum: ModerationAction, example: ModerationAction.DELETE })
  action!: ModerationAction;

  @ApiProperty({ enum: ReportContentType, example: ReportContentType.COMMENT })
  contentType!: ReportContentType;

  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60711' })
  contentId!: string;

  @ApiProperty({ example: 1, description: 'Open reports about this content that were marked resolved' })
  reportsResolved!: number;
}
