import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ValidationErrorResponseDto } from '../auth/dto/validation-error-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { CreateReportDto } from './dto/create-report.dto';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';
import { ReportPageDto, ReportResponseDto } from './dto/report-response.dto';
import { ReportsService } from './reports.service';

// GEN-09: report a post, comment, review or itinerary, at most once per item
@ApiTags('reports')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @ApiOperation({
    summary: 'Report a post, comment, review or itinerary (GEN-09)',
    description: 'Logged-in users. Each user can report a given item only once.',
  })
  @ApiBody({ type: CreateReportDto })
  @ApiCreatedResponse({ description: 'Report created (status open)', type: ReportResponseDto })
  @ApiBadRequestResponse({
    description:
      'Invalid body (target type, target id, reason 5-500 characters), or "Reporting itinerary is not available yet"',
    type: ValidationErrorResponseDto,
    example: { message: 'Validation failed', errors: { reason: ['Reason must be between 5 and 500 characters'] } },
  })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiNotFoundResponse({ description: 'The reported post, comment or review does not exist' })
  @ApiConflictResponse({ description: 'You have already reported this item' })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateReportDto): Promise<ReportResponseDto> {
    return this.reportsService.create(req.user!.sub, dto) as Promise<ReportResponseDto>;
  }

  @Get('mine')
  @ApiOperation({ summary: 'List my own reports, newest first (GEN-09)', description: '10 per page.' })
  @ApiQuery({ name: 'page', required: false, example: 1, description: 'Page number, integer >= 1' })
  @ApiOkResponse({ description: 'One page of my reports', type: ReportPageDto })
  @ApiBadRequestResponse({ description: 'Invalid page (must be an integer >= 1)', type: ValidationErrorResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  listMine(@Req() req: AuthenticatedRequest, @Query() query: ListReportsQueryDto): Promise<ReportPageDto> {
    return this.reportsService.listMine(req.user!.sub, query) as Promise<ReportPageDto>;
  }
}
