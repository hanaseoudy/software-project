import { ApiProperty } from '@nestjs/swagger';
import { ReportAction, ReportStatus, ReportTargetType } from '../enums/report.enums';

// GEN-09: one report
export class ReportResponseDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60801' })
  id!: string;

  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60700', description: 'Reporter user id' })
  reporter!: string;

  @ApiProperty({ enum: ReportTargetType, example: ReportTargetType.POST })
  targetType!: ReportTargetType;

  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60711' })
  targetId!: string;

  @ApiProperty({ example: 'This post contains offensive language.' })
  reason!: string;

  @ApiProperty({ enum: ReportStatus, example: ReportStatus.OPEN })
  status!: ReportStatus;

  @ApiProperty({ enum: ReportAction, nullable: true, example: null, description: 'Set when an admin resolves it' })
  action!: ReportAction | null;

  @ApiProperty({ nullable: true, example: null, description: 'Admin user id' })
  resolvedBy!: string | null;

  @ApiProperty({ nullable: true, example: null })
  resolvedAt!: Date | null;

  @ApiProperty({ example: '2026-11-10T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-11-10T12:00:00.000Z' })
  updatedAt!: Date;
}

// GEN-09: paginated list of my reports
export class ReportPageDto {
  @ApiProperty({ type: [ReportResponseDto] })
  items!: ReportResponseDto[];

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 10, description: 'Always 10' })
  pageSize!: number;

  @ApiProperty({ example: 2 })
  totalPages!: number;
}
