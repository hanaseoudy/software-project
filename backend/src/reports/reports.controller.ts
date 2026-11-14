import { Controller, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { ValidationErrorResponseDto } from '../auth/dto/validation-error-response.dto';
import { ErrorResponseDto } from '../blog/dto/error-response.dto';
import { StrictBody } from '../blog/strict-body.decorator';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportResponseDto } from './dto/report-response.dto';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // Supporting endpoint for GEN-09 (PDF 8.10: reporting endpoints "as needed")
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Report a post, comment, review or itinerary (GEN-09)',
    description:
      'Registered users only. Reports an item the user can see (a published, visible post; a visible comment ' +
      'on such a post; a visible review; a public itinerary) with a free-text reason of 1 to 500 characters ' +
      '(trimmed). A user can report each item only once; a second report returns 409. ' +
      'The report is created with status "open". Unknown fields are rejected.',
  })
  @ApiBody({ type: CreateReportDto })
  @ApiResponse({ status: 201, description: 'Report created', type: ReportResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Validation failed; errors are grouped by field',
    type: ValidationErrorResponseDto,
    example: { message: 'Validation failed', errors: { reason: ['Reason is required'] } },
  })
  @ApiResponse({ status: 401, description: 'Not logged in', type: ErrorResponseDto })
  @ApiResponse({
    status: 404,
    description: 'The reported content does not exist or is not visible',
    type: ErrorResponseDto,
  })
  @ApiResponse({ status: 409, description: 'You have already reported this item', type: ErrorResponseDto })
  create(@Req() req: AuthenticatedRequest, @StrictBody() dto: CreateReportDto): Promise<ReportResponseDto> {
    return this.reportsService.create(this.requireUserId(req), dto);
  }

  // The user id always comes from the authenticated token, never from the body or query
  private requireUserId(req: AuthenticatedRequest): string {
    const user = req.user as (AuthenticatedRequest['user'] & { userId?: unknown; id?: unknown; _id?: unknown }) | undefined;
    const userId = user?.userId ?? user?.id ?? user?._id ?? user?.sub;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    return String(userId);
  }
}
