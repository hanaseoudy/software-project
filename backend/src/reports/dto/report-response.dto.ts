import { ApiProperty } from '@nestjs/swagger';
import { ReportContentType, ReportStatus } from '../enums/report.enums';

// GEN-09: the report just created (no reporter details are exposed)
export class ReportResponseDto {
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
}
