import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { ACCESS_COOKIE } from '../auth/auth.cookies';
import { ValidationErrorResponseDto } from '../auth/dto/validation-error-response.dto';
import { PaginationQueryDto } from '../common/pagination/pagination';
import { AdminProviderListsService } from './admin-provider-lists.service';
import { AdminAirlinesPageDto, AdminHotelsPageDto } from './dto/provider-list.dto';

const PAGE_QUERY = { name: 'page', required: false, type: Number, example: 1, description: 'Page number, starting at 1' };
const BAD_PAGE = {
  description: 'Invalid page',
  type: ValidationErrorResponseDto,
  example: { message: 'Validation failed', errors: { page: ['Page must be a whole number'] } },
};
const UNAUTHORIZED = {
  description: 'Not logged in',
  example: { message: 'Not authenticated', error: 'Unauthorized', statusCode: 401 },
};
const FORBIDDEN = {
  description: 'Caller is not an admin',
  example: { message: 'You do not have permission to perform this action', error: 'Forbidden', statusCode: 403 },
};

// GET /api/airlines has no path parameter, so it never clashes with GET /api/airlines/:id
@ApiTags('admin')
@ApiCookieAuth(ACCESS_COOKIE)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('airlines')
export class AdminAirlinesListController {
  constructor(private lists: AdminProviderListsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all airlines (admin, ACC-13 / ACC-15)',
    description:
      'Admin only. All airlines, active and deactivated, sorted by name, 10 per page (GEN-05). Used to pick the ' +
      'airline a new moderator is linked to and to deactivate or reactivate an airline.',
  })
  @ApiQuery(PAGE_QUERY)
  @ApiOkResponse({ description: 'One page of airlines', type: AdminAirlinesPageDto })
  @ApiBadRequestResponse(BAD_PAGE)
  @ApiUnauthorizedResponse(UNAUTHORIZED)
  @ApiForbiddenResponse(FORBIDDEN)
  list(@Query() query: PaginationQueryDto): Promise<AdminAirlinesPageDto> {
    return this.lists.listAirlines(query.page ?? 1);
  }
}

// GET /api/hotels has no path parameter, so it never clashes with /api/hotels/search or /api/hotels/:id
@ApiTags('admin')
@ApiCookieAuth(ACCESS_COOKIE)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('hotels')
export class AdminHotelsListController {
  constructor(private lists: AdminProviderListsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all hotels (admin, ACC-13 / ACC-15)',
    description:
      'Admin only. All hotels, active and deactivated, sorted by name, 10 per page (GEN-05). Used to pick the ' +
      'hotel a new moderator is linked to and to deactivate or reactivate a hotel. Guests use /api/hotels/search.',
  })
  @ApiQuery(PAGE_QUERY)
  @ApiOkResponse({ description: 'One page of hotels', type: AdminHotelsPageDto })
  @ApiBadRequestResponse(BAD_PAGE)
  @ApiUnauthorizedResponse(UNAUTHORIZED)
  @ApiForbiddenResponse(FORBIDDEN)
  list(@Query() query: PaginationQueryDto): Promise<AdminHotelsPageDto> {
    return this.lists.listHotels(query.page ?? 1);
  }
}