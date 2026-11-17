import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';
import { ResolveAction } from '../enums/moderation.enums';
import { ReportContentType, ReportStatus } from '../enums/report.enums';

// GEN-10: GET /api/admin/reports?status=&page=. Open reports by default; page size is fixed at 10 (GEN-05)
export class ListReportsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ReportStatus, default: ReportStatus.OPEN, description: 'Report status to list' })
  @IsOptional()
  @IsEnum(ReportStatus, { message: 'Status must be open, dismissed or resolved' })
  status?: ReportStatus = ReportStatus.OPEN;
}

// GEN-10: PATCH /api/admin/reports/:id
export class ResolveReportDto {
  @ApiProperty({
    enum: ResolveAction,
    example: ResolveAction.HIDE,
    description: 'dismiss keeps the content; hide hides it; delete deletes it',
  })
  @IsEnum(ResolveAction, { message: 'Action must be dismiss, hide or delete' })
  action!: ResolveAction;
}

export class ReportIdParamDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60730', description: 'Report id (MongoDB ObjectId)' })
  @IsMongoId({ message: 'Report id must be a valid id' })
  id!: string;
}

// GEN-10: /api/admin/content/:type/:id
export class ContentParamsDto {
  @ApiProperty({ enum: ReportContentType, example: ReportContentType.POST })
  @IsEnum(ReportContentType, { message: 'Content type must be post, comment, review or itinerary' })
  type!: ReportContentType;

  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60711', description: 'Content id (MongoDB ObjectId)' })
  @IsMongoId({ message: 'Content id must be a valid id' })
  id!: string;
}
