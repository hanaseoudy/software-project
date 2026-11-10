import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
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
import { ValidationErrorResponseDto } from '../auth/dto/validation-error-response.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { AdminReportsService } from './admin-reports.service';
import { AdminListReportsQueryDto } from './dto/admin-list-reports-query.dto';
import {
  AdminReportPageDto,
  ModerationResultDto,
  ResolveReportResultDto,
} from './dto/admin-report-response.dto';
import { ResolveReportDto } from './dto/resolve-report.dto';
import { ReportStatus, ReportTargetType } from './enums/report.enums';

const TYPE_PARAM = {
  name: 'type',
  enum: ReportTargetType,
  description: 'post or comment (review and itinerary return 400 "Moderation for <type> is not available yet")',
};
const ID_PARAM = { name: 'id', description: 'Content id', example: '6650f1c2a1b2c3d4e5f60711' };
const typePipe = new ParseEnumPipe(ReportTargetType, {
  exceptionFactory: () => new BadRequestException('Type must be post, comment, review or itinerary'),
});
const NOT_AVAILABLE = 'Invalid type, or "Moderation for review / itinerary is not available yet"';

// GEN-10: admin report resolution and direct content moderation (admins only)
@ApiTags('admin moderation')
@ApiCookieAuth('access_token')
@ApiUnauthorizedResponse({ description: 'Not logged in' })
@ApiForbiddenResponse({ description: 'Not an admin' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminReportsController {
  constructor(private readonly adminReports: AdminReportsService) {}

  @Get('reports')
  @ApiOperation({
    summary: 'List reports, newest first (GEN-10)',
    description: 'Defaults to open reports. Each item has the report count for its content and a short preview. 10 per page.',
  })
  @ApiQuery({ name: 'status', required: false, enum: ReportStatus, example: ReportStatus.OPEN })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiOkResponse({ description: 'One page of reports', type: AdminReportPageDto })
  @ApiBadRequestResponse({ description: 'Invalid status or page', type: ValidationErrorResponseDto })
  list(@Query() query: AdminListReportsQueryDto): Promise<AdminReportPageDto> {
    return this.adminReports.list(query) as Promise<AdminReportPageDto>;
  }

  @Patch('reports/:id/resolve')
  @ApiOperation({
    summary: 'Resolve a report: dismiss, hide or delete the content (GEN-10)',
    description:
      'dismiss marks the report dismissed; hide sets isHidden = true; delete removes the content (a post is ' +
      'deleted with its comments, likes and images). All other open reports on the same item are closed too, ' +
      'with resolvedBy, resolvedAt and action recorded.',
  })
  @ApiParam({ name: 'id', description: 'Report id', example: '6650f1c2a1b2c3d4e5f60801' })
  @ApiBody({ type: ResolveReportDto })
  @ApiOkResponse({ description: 'Report resolved', type: ResolveReportResultDto })
  @ApiBadRequestResponse({ description: `Invalid action. ${NOT_AVAILABLE}` })
  @ApiNotFoundResponse({ description: 'Report or reported content not found' })
  @ApiConflictResponse({ description: 'Report already resolved' })
  resolve(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ResolveReportDto,
  ): Promise<ResolveReportResultDto> {
    return this.adminReports.resolve(id, dto.action, req.user!.sub) as Promise<ResolveReportResultDto>;
  }

  @Patch('content/:type/:id/hide')
  @ApiOperation({
    summary: 'Hide content directly (GEN-10)',
    description: 'Sets isHidden = true and closes the open reports on it. Hidden content is only for its author and admins.',
  })
  @ApiParam(TYPE_PARAM)
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ description: 'Content hidden', type: ModerationResultDto })
  @ApiBadRequestResponse({ description: NOT_AVAILABLE })
  @ApiNotFoundResponse({ description: 'Content not found' })
  hide(
    @Req() req: AuthenticatedRequest,
    @Param('type', typePipe) type: ReportTargetType,
    @Param('id') id: string,
  ): Promise<ModerationResultDto> {
    return this.adminReports.moderate(type, id, 'hide', req.user!.sub);
  }

  @Patch('content/:type/:id/unhide')
  @ApiOperation({ summary: 'Unhide content directly (GEN-10)', description: 'Sets isHidden = false.' })
  @ApiParam(TYPE_PARAM)
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ description: 'Content visible again', type: ModerationResultDto })
  @ApiBadRequestResponse({ description: NOT_AVAILABLE })
  @ApiNotFoundResponse({ description: 'Content not found' })
  unhide(
    @Req() req: AuthenticatedRequest,
    @Param('type', typePipe) type: ReportTargetType,
    @Param('id') id: string,
  ): Promise<ModerationResultDto> {
    return this.adminReports.moderate(type, id, 'unhide', req.user!.sub);
  }

  @Delete('content/:type/:id')
  @ApiOperation({
    summary: 'Delete content directly (GEN-10)',
    description: 'A post is deleted with its comments, likes and images. Closes the open reports on it.',
  })
  @ApiParam(TYPE_PARAM)
  @ApiParam(ID_PARAM)
  @ApiOkResponse({ description: 'Content deleted', type: ModerationResultDto })
  @ApiBadRequestResponse({ description: NOT_AVAILABLE })
  @ApiNotFoundResponse({ description: 'Content not found' })
  remove(
    @Req() req: AuthenticatedRequest,
    @Param('type', typePipe) type: ReportTargetType,
    @Param('id') id: string,
  ): Promise<ModerationResultDto> {
    return this.adminReports.moderate(type, id, 'delete', req.user!.sub);
  }
}
