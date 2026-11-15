import { Controller, Delete, Get, HttpCode, Param, Patch, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ACCESS_COOKIE } from '../auth/auth.cookies';
import { ValidationErrorResponseDto } from '../auth/dto/validation-error-response.dto';
import { ErrorResponseDto } from '../blog/dto/error-response.dto';
import { StrictBody } from '../blog/strict-body.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { AdminReportsService } from './admin-reports.service';
import { ContentParamsDto, ListReportsQueryDto, ReportIdParamDto, ResolveReportDto } from './dto/admin-report-request.dto';
import { AdminReportsPageDto, ModerationResultDto, ResolveReportResponseDto } from './dto/admin-report-response.dto';
import { ModerationAction } from './enums/moderation.enums';
import { ReportContentType, ReportStatus } from './enums/report.enums';
import { StrictQuery } from './strict-query.decorator';

const UNAUTHORIZED = { description: 'Not logged in', type: ErrorResponseDto };
const FORBIDDEN = {
  description: 'Caller is not an admin',
  type: ErrorResponseDto,
  example: { statusCode: 403, message: 'You do not have permission to perform this action', error: 'Forbidden' },
};

// GEN-10: admin report resolution and content moderation. Admin only on every route (401 / 403).
@ApiTags('admin')
@ApiCookieAuth(ACCESS_COOKIE)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminReportsController {
  constructor(private readonly adminReportsService: AdminReportsService) {}

  @Get('reports')
  @ApiOperation({
    summary: 'List reports for moderation (GEN-09, GEN-10)',
    description:
      'Admin only. Lists open reports by default (optional status filter), oldest first so the queue is handled ' +
      'in order. Page size is fixed at 10 (GEN-05); only "page" is accepted, unknown parameters are rejected. ' +
      'Each report shows the reporter (id and name only) and a short preview of the content, or null when the ' +
      'content no longer exists. An empty page returns 200 with an empty list.',
  })
  @ApiQuery({ name: 'status', required: false, enum: ReportStatus, description: 'Defaults to open' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number, starting at 1' })
  @ApiOkResponse({ description: 'One page of reports', type: AdminReportsPageDto })
  @ApiBadRequestResponse({
    description: 'Invalid status, page or an unknown query parameter',
    type: ValidationErrorResponseDto,
    example: { message: 'Validation failed', errors: { status: ['Status must be open, dismissed or resolved'] } },
  })
  @ApiUnauthorizedResponse(UNAUTHORIZED)
  @ApiForbiddenResponse(FORBIDDEN)
  list(@Req() req: AuthenticatedRequest, @StrictQuery() query: ListReportsQueryDto): Promise<AdminReportsPageDto> {
    return this.adminReportsService.list(this.requireUserId(req), query);
  }

  @Patch('reports/:id')
  @ApiOperation({
    summary: 'Resolve a report by dismissing it, hiding or deleting the content (GEN-10)',
    description:
      'Admin only. "dismiss" sets the report to dismissed and leaves the content unchanged (works even if the ' +
      'content was already deleted). "hide" hides the reported content (visible only to its author and admins) ' +
      'and "delete" deletes it (a post with its comments and likes; a comment also lowers the post comment count; ' +
      'an itinerary with its days, activities and costs); both set the report and every other open report about ' +
      'the same item to resolved. A report can be resolved only once: 409 afterwards, also when two admins act at ' +
      'the same time. Itineraries cannot be hidden yet (400). Unknown body fields are rejected.',
  })
  @ApiParam({ name: 'id', description: 'Report id (MongoDB ObjectId)', example: '6650f1c2a1b2c3d4e5f60730' })
  @ApiBody({ type: ResolveReportDto })
  @ApiOkResponse({ description: 'Report resolved or dismissed', type: ResolveReportResponseDto })
  @ApiBadRequestResponse({
    description:
      'Invalid report id or action, unknown body field, or "Hiding this content type is not available yet"',
    type: ValidationErrorResponseDto,
    example: { message: 'Validation failed', errors: { action: ['Action must be dismiss, hide or delete'] } },
  })
  @ApiUnauthorizedResponse(UNAUTHORIZED)
  @ApiForbiddenResponse(FORBIDDEN)
  @ApiNotFoundResponse({
    description: '"Report not found", or "Content not found" when hiding or deleting content that no longer exists',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({ description: 'The report has already been resolved or dismissed', type: ErrorResponseDto })
  resolve(
    @Req() req: AuthenticatedRequest,
    @Param() params: ReportIdParamDto,
    @StrictBody() dto: ResolveReportDto,
  ): Promise<ResolveReportResponseDto> {
    return this.adminReportsService.resolve(this.requireUserId(req), params.id, dto);
  }

  // Supporting endpoint (PDF 8.10): GEN-10 "hide ... any post, comment, review or itinerary directly"
  @Patch('content/:type/:id/hide')
  @ApiOperation({
    summary: 'Hide a post, comment or review directly (GEN-10)',
    description:
      'Admin only. Hides the item so it is visible only to its author and admins, and marks the open reports ' +
      'about it as resolved. Hiding an already hidden item succeeds. Itineraries cannot be hidden yet (400).',
  })
  @ApiParam({ name: 'type', enum: ReportContentType })
  @ApiParam({ name: 'id', description: 'Content id (MongoDB ObjectId)', example: '6650f1c2a1b2c3d4e5f60711' })
  @ApiOkResponse({ description: 'Content hidden', type: ModerationResultDto })
  @ApiBadRequestResponse({
    description: 'Invalid type or id, or "Hiding this content type is not available yet"',
    type: ValidationErrorResponseDto,
    example: { message: 'Validation failed', errors: { type: ['Content type must be post, comment, review or itinerary'] } },
  })
  @ApiUnauthorizedResponse(UNAUTHORIZED)
  @ApiForbiddenResponse(FORBIDDEN)
  @ApiNotFoundResponse({ description: 'Content not found', type: ErrorResponseDto })
  hide(@Req() req: AuthenticatedRequest, @Param() params: ContentParamsDto): Promise<ModerationResultDto> {
    return this.adminReportsService.moderate(this.requireUserId(req), params, ModerationAction.HIDE);
  }

  @Delete('content/:type/:id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Delete a post, comment, review or itinerary directly (GEN-10)',
    description:
      'Admin only. Deletes the item: a post with its comments and likes; a comment also lowers its post comment ' +
      'count (never below 0); an itinerary with its days, activities, budget entries and transport costs. Open ' +
      'reports about the item are marked resolved. Confirmation before deleting is handled by the frontend (GEN-03).',
  })
  @ApiParam({ name: 'type', enum: ReportContentType })
  @ApiParam({ name: 'id', description: 'Content id (MongoDB ObjectId)', example: '6650f1c2a1b2c3d4e5f60711' })
  @ApiOkResponse({ description: 'Content deleted', type: ModerationResultDto })
  @ApiBadRequestResponse({
    description: 'Invalid type or id',
    type: ValidationErrorResponseDto,
    example: { message: 'Validation failed', errors: { id: ['Content id must be a valid id'] } },
  })
  @ApiUnauthorizedResponse(UNAUTHORIZED)
  @ApiForbiddenResponse(FORBIDDEN)
  @ApiNotFoundResponse({ description: 'Content not found', type: ErrorResponseDto })
  remove(@Req() req: AuthenticatedRequest, @Param() params: ContentParamsDto): Promise<ModerationResultDto> {
    return this.adminReportsService.moderate(this.requireUserId(req), params, ModerationAction.DELETE);
  }

  // The admin id always comes from the authenticated token, never from the body or query
  private requireUserId(req: AuthenticatedRequest): string {
    const user = req.user as (AuthenticatedRequest['user'] & { userId?: unknown; id?: unknown; _id?: unknown }) | undefined;
    const userId = user?.userId ?? user?.id ?? user?._id ?? user?.sub;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    return String(userId);
  }
}
