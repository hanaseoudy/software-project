import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ACCESS_COOKIE } from '../auth/auth.cookies';
import { ValidationErrorResponseDto } from '../auth/dto/validation-error-response.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { AdminAnalyticsService } from './admin-analytics.service';
import { ProviderAnalyticsQueryDto } from './dto/provider-analytics-query.dto';

@ApiTags('admin')
@ApiCookieAuth(ACCESS_COOKIE)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly analyticsService: AdminAnalyticsService) {}

  @Get('providers')
  @ApiOperation({
    summary: 'Bookings and revenue per provider over a period (BON-01)',
    description:
      'Read-only dashboard data for admins. One row per provider (airline or hotel), highest revenue first, 10 per page (GEN-05). from/to select the period by the date the booking was created (whole days, UTC); leave them out for all time. bookings and revenue count confirmed and completed bookings only; cancelled bookings are counted separately and are not revenue. A flight booking belongs to the airline of its outbound flight. summary covers all providers of the selection, not only the current page.',
  })
  @ApiOkResponse({
    description: 'Summary and one page of providers',
    schema: {
      example: {
        period: { from: '2026-11-01', to: '2026-11-30' },
        currency: 'USD',
        summary: { bookings: 12, cancelled: 2, revenue: 3450.5 },
        items: [
          {
            type: 'hotel',
            id: '6afcf209bf086f701f0b459a',
            name: 'Nile View Hotel',
            bookings: 7,
            cancelled: 1,
            revenue: 2100,
            averageBookingValue: 300,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid page, type or date',
    type: ValidationErrorResponseDto,
    example: {
      message: 'Validation failed',
      errors: { from: ['From must be a valid date (YYYY-MM-DD)'] },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Not logged in',
    example: {
      message: 'Not authenticated',
      error: 'Unauthorized',
      statusCode: 401,
    },
  })
  @ApiForbiddenResponse({
    description: 'Caller is not an admin',
    example: {
      message: 'You do not have permission to perform this action',
      error: 'Forbidden',
      statusCode: 403,
    },
  })
  providers(@Query() query: ProviderAnalyticsQueryDto) {
    return this.analyticsService.providerAnalytics(query);
  }
}
