import { ApiProperty } from '@nestjs/swagger';
import { PAGE_SIZE } from '../../common/pagination/pagination';
import { AuditAction, AuditTargetType } from '../enums/audit-log.enums';

// GEN-07: the admin who acted, display name only (never email, password, tokens or role)
export class AuditActorDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60700' })
  id!: string;

  @ApiProperty({ example: 'Mona Adel', nullable: true, type: String, description: 'Null when the account no longer exists' })
  name!: string | null;
}

// GEN-07: one audit log entry
export class AuditLogItemDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60800' })
  id!: string;

  @ApiProperty({ type: AuditActorDto })
  actor!: AuditActorDto;

  @ApiProperty({ example: AuditAction.ACCOUNT_SUSPENDED })
  action!: string;

  @ApiProperty({ example: AuditTargetType.ACCOUNT })
  targetType!: string;

  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60711' })
  targetId!: string;

  @ApiProperty({ example: null, nullable: true, type: String, description: 'Report that led to the action, if any' })
  reportId!: string | null;

  @ApiProperty({
    example: { reason: 'Abusive content' },
    nullable: true,
    type: 'object',
    additionalProperties: true,
    description: 'Short non-secret context, or null',
  })
  details!: Record<string, unknown> | null;

  @ApiProperty({ example: '2026-11-17T10:00:00.000Z' })
  createdAt!: Date;
}

// GEN-05: one page of audit log entries
export class AuditLogsPageDto {
  @ApiProperty({ type: [AuditLogItemDto], description: 'Up to 10 entries, newest first' })
  items!: AuditLogItemDto[];

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: PAGE_SIZE, description: 'Always 10' })
  pageSize!: number;

  @ApiProperty({ example: 2 })
  totalPages!: number;
}
