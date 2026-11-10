import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ReportAction } from '../enums/report.enums';

// GEN-10: PATCH /api/admin/reports/:id/resolve body
export class ResolveReportDto {
  @ApiProperty({
    enum: ReportAction,
    example: ReportAction.HIDE,
    description: 'dismiss: keep the content; hide: set isHidden = true; delete: delete the content',
  })
  @IsEnum(ReportAction, { message: 'Action must be dismiss, hide or delete' })
  action!: ReportAction;
}
