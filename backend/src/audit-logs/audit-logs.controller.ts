import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ACCESS_COOKIE } from '../auth/auth.cookies';
import { ValidationErrorResponseDto } from '../auth/dto/validation-error-response.dto';
import { ErrorResponseDto } from '../blog/dto/error-response.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { StrictQuery } from '../reports/strict-query.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { AuditLogsService } from './audit-logs.service';
import { AuditLogsPageDto } from './dto/audit-log-response.dto';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import { AuditAction, AuditTargetType } from './enums/audit-log.enums';

@ApiTags('admin')
@ApiCookieAuth(ACCESS_COOKIE)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  // GEN-07: read-only. Entries are written only by other modules through AuditLogsService.record().
  @Get()
  @ApiOperation({
    summary: 'List the audit log of admin actions (GEN-07)',
    description:
      'Admin only. Lists recorded admin actions (for example suspensions, reactivations and content deletions) ' +
      'newest first. Page size is fixed at 10 (GEN-05); only "page" is accepted for paging, unknown parameters ' +
      'are rejected. Optional filters, all combinable: exact action, actor id, exact target type, and a ' +
      'from/to creation date range. Each entry shows the acting admin by id and display name only. ' +
      'An empty page returns 200 with an empty list. Entries cannot be created, changed or deleted through the API.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, description: 'Page number, starting at 1' })
  @ApiQuery({
    name: 'action',
    required: false,
    type: String,
    example: AuditAction.ACCOUNT_SUSPENDED,
    description: 'Exact action name in upper snake case',
  })
  @ApiQuery({
    name: 'actorId',
    required: false,
    type: String,
    example: '6650f1c2a1b2c3d4e5f60700',
    description: 'Id of the admin who acted',
  })
  @ApiQuery({
    name: 'targetType',
    required: false,
    type: String,
    example: AuditTargetType.ACCOUNT,
    description: 'Exact target type, for example account, hotel, airline, post, comment, review, itinerary or report',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    example: '2026-11-01T00:00:00.000Z',
    description: 'ISO 8601 date or date-time; entries created at or after it',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    example: '2026-11-30T23:59:59.999Z',
    description: 'ISO 8601 date or date-time; entries created at or before it (not before "from")',
  })
  @ApiOkResponse({ description: 'One page of audit log entries, newest first', type: AuditLogsPageDto })
  @ApiBadRequestResponse({
    description: 'Invalid page, action, actor id, target type or date, "to" before "from", or an unknown query parameter',
    type: ValidationErrorResponseDto,
    example: { message: 'Validation failed', errors: { actorId: ['Actor id must be a valid id'] } },
  })
  @ApiUnauthorizedResponse({
    description: 'Not logged in',
    type: ErrorResponseDto,
    example: { statusCode: 401, message: 'Not authenticated', error: 'Unauthorized' },
  })
  @ApiForbiddenResponse({
    description: 'Caller is not an admin',
    type: ErrorResponseDto,
    example: { statusCode: 403, message: 'You do not have permission to perform this action', error: 'Forbidden' },
  })
  @ApiInternalServerErrorResponse({
    description: 'The audit log could not be loaded',
    type: ErrorResponseDto,
    example: { statusCode: 500, message: 'Could not load the audit log', error: 'Internal Server Error' },
  })
  list(@StrictQuery() query: ListAuditLogsQueryDto): Promise<AuditLogsPageDto> {
    return this.auditLogsService.list(query);
  }
}
