import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional, IsString, Matches, MaxLength, ValidateBy } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination';
import {
  AUDIT_ACTION_MAX_LENGTH,
  AUDIT_ACTION_PATTERN,
  AUDIT_TARGET_TYPE_MAX_LENGTH,
  AUDIT_TARGET_TYPE_PATTERN,
  AuditAction,
  AuditTargetType,
  OBJECT_ID_PATTERN,
} from '../enums/audit-log.enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimUpper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const trimLower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

// GEN-02: "to" cannot be before "from" (checked only when both are valid dates)
const IsNotBeforeFrom = () =>
  ValidateBy({
    name: 'isNotBeforeFrom',
    validator: {
      validate: (value: unknown, args) => {
        const from = (args?.object as { from?: unknown } | undefined)?.from;
        if (typeof value !== 'string' || typeof from !== 'string') return true;
        const start = Date.parse(from);
        const end = Date.parse(value);
        return Number.isNaN(start) || Number.isNaN(end) || start <= end;
      },
      defaultMessage: () => 'To must be the same as or later than from',
    },
  });

// GEN-07: GET /api/admin/audit-logs?page=&action=&actorId=&targetType=&from=&to= (page size fixed at 10, GEN-05)
export class ListAuditLogsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: AuditAction.ACCOUNT_SUSPENDED,
    maxLength: AUDIT_ACTION_MAX_LENGTH,
    description: 'Exact action name in upper snake case',
  })
  @IsOptional()
  @Transform(trimUpper)
  @IsString({ message: 'Action must be text' })
  @MaxLength(AUDIT_ACTION_MAX_LENGTH, { message: `Action must be at most ${AUDIT_ACTION_MAX_LENGTH} characters` })
  @Matches(AUDIT_ACTION_PATTERN, { message: 'Action must be an upper snake case name such as ACCOUNT_SUSPENDED' })
  action?: string;

  @ApiPropertyOptional({ example: '6650f1c2a1b2c3d4e5f60700', description: 'Id of the admin who acted' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Actor id must be text' })
  @Matches(OBJECT_ID_PATTERN, { message: 'Actor id must be a valid id' })
  actorId?: string;

  @ApiPropertyOptional({
    example: AuditTargetType.ACCOUNT,
    maxLength: AUDIT_TARGET_TYPE_MAX_LENGTH,
    description: 'Exact target type, for example account, hotel, airline, post, comment, review, itinerary or report',
  })
  @IsOptional()
  @Transform(trimLower)
  @IsString({ message: 'Target type must be text' })
  @MaxLength(AUDIT_TARGET_TYPE_MAX_LENGTH, {
    message: `Target type must be at most ${AUDIT_TARGET_TYPE_MAX_LENGTH} characters`,
  })
  @Matches(AUDIT_TARGET_TYPE_PATTERN, { message: 'Target type must be a lowercase word such as account or post' })
  targetType?: string;

  @ApiPropertyOptional({
    example: '2026-11-01T00:00:00.000Z',
    description: 'Only entries created at or after this ISO 8601 date or date-time (a date alone means 00:00 UTC)',
  })
  @IsOptional()
  @Transform(trim)
  @IsISO8601({ strict: true }, { message: 'From must be a valid ISO 8601 date' })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-11-30T23:59:59.999Z',
    description: 'Only entries created at or before this ISO 8601 date or date-time (a date alone means 00:00 UTC)',
  })
  @IsOptional()
  @Transform(trim)
  @IsISO8601({ strict: true }, { message: 'To must be a valid ISO 8601 date' })
  @IsNotBeforeFrom()
  to?: string;
}
