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
import { AdminBookingsService } from './admin-bookings.service';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto';

@ApiTags('admin')
@ApiCookieAuth(ACCESS_COOKIE)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/bookings')
export class AdminBookingsController {
  constructor(private readonly bookingsService: AdminBookingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Read-only list of all flight and hotel bookings (ACC-17)',
    description:
      'Newest first, 10 per page (GEN-05). Filter by type (flight or hotel), status and a date range. from/to filter the date the booking was created (whole days, UTC). Each row shows the booking reference (null until payment confirmed the booking), the user, the provider (hotel or airline), the travel dates (check-in/out, or first departure/last arrival), the amount paid or to pay and the status.',
  })
  @ApiOkResponse({
    description: 'One page of bookings',
    schema: {
      example: {
        items: [
          {
            type: 'flight',
            id: '6afcf209bf086f701f0b459a',
            reference: 'FLT-7K3M9QXA',
            user: {
              id: '6af6f6e97a4b19aea096da0f',
              name: 'Mariam Test',
              email: 'mariam.test@example.com',
            },
            provider: 'EgyptAir',
            startDate: '2026-12-05T10:00:00.000Z',
            endDate: '2026-12-05T13:00:00.000Z',
            amount: 120,
            currency: 'USD',
            status: 'CONFIRMED',
            createdAt: '2026-11-18T00:32:09.142Z',
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
    description: 'Invalid page, type, status or date',
    type: ValidationErrorResponseDto,
    example: {
      message: 'Validation failed',
      errors: { type: ['Type must be one of: flight, hotel'] },
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
  listBookings(@Query() query: ListBookingsQueryDto) {
    return this.bookingsService.listBookings(query);
  }
}
