import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ReportStatus } from '../enums/report.enums';
import { ListReportsQueryDto } from './list-reports-query.dto';

// GEN-10: GET /api/admin/reports?status=open&page=1
export class AdminListReportsQueryDto extends ListReportsQueryDto {
  @ApiPropertyOptional({ enum: ReportStatus, default: ReportStatus.OPEN })
  @IsOptional()
  @IsEnum(ReportStatus, { message: 'Status must be open, dismissed or resolved' })
  status: ReportStatus = ReportStatus.OPEN;
}
