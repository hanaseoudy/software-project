import { BadRequestException, Controller, Param, ParseEnumPipe, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { ProviderType } from '../users/schemas/moderatorassignment.schema';
import { ACCESS_COOKIE } from '../auth/auth.cookies';
import { AdminProvidersService } from './admin-providers.service';

const providerTypePipe = new ParseEnumPipe(ProviderType, {
  exceptionFactory: () => new BadRequestException('Provider type must be hotel or airline'),
});

@ApiTags('admin')
@ApiCookieAuth(ACCESS_COOKIE)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/providers')
export class AdminProvidersController {
  constructor(private adminProvidersService: AdminProvidersService) {}

  @Patch(':type/:id/deactivate')
  @ApiOperation({
    summary: 'Deactivate a hotel or airline (ACC-15)',
    description:
      'Its listings are hidden from search and cannot be booked. Existing Confirmed bookings stay valid. The moderators assigned to it get an in-app notification.',
  })
  @ApiParam({ name: 'type', enum: ProviderType })
  @ApiOkResponse({
    description: 'Provider deactivated',
    schema: { example: { id: '6aef52048e9d356647b49abc', type: 'hotel', name: 'Nile Palace', isActive: false } },
  })
  @ApiBadRequestResponse({
    description: 'Invalid provider type or ID',
    example: { message: 'Provider type must be hotel or airline', error: 'Bad Request', statusCode: 400 },
  })
  @ApiUnauthorizedResponse({
    description: 'Not logged in',
    example: { message: 'Not authenticated', error: 'Unauthorized', statusCode: 401 },
  })
  @ApiForbiddenResponse({
    description: 'Caller is not an admin',
    example: { message: 'You do not have permission to perform this action', error: 'Forbidden', statusCode: 403 },
  })
  @ApiNotFoundResponse({
    description: 'The hotel or airline does not exist',
    example: { message: 'Hotel not found', error: 'Not Found', statusCode: 404 },
  })
  @ApiConflictResponse({
    description: 'The provider is already deactivated',
    example: { message: 'Hotel is already deactivated', error: 'Conflict', statusCode: 409 },
  })
  deactivateProvider(@Param('type', providerTypePipe) type: ProviderType, @Param('id') id: string) {
    return this.adminProvidersService.deactivateProvider(type, id);
  }

  @Patch(':type/:id/reactivate')
  @ApiOperation({
    summary: 'Reactivate a hotel or airline (ACC-15)',
    description: 'Its listings are visible and bookable again. The moderators assigned to it get an in-app notification.',
  })
  @ApiParam({ name: 'type', enum: ProviderType })
  @ApiOkResponse({
    description: 'Provider reactivated',
    schema: { example: { id: '6aef52048e9d356647b49abc', type: 'hotel', name: 'Nile Palace', isActive: true } },
  })
  @ApiBadRequestResponse({
    description: 'Invalid provider type or ID',
    example: { message: 'Invalid provider ID', error: 'Bad Request', statusCode: 400 },
  })
  @ApiUnauthorizedResponse({
    description: 'Not logged in',
    example: { message: 'Not authenticated', error: 'Unauthorized', statusCode: 401 },
  })
  @ApiForbiddenResponse({
    description: 'Caller is not an admin',
    example: { message: 'You do not have permission to perform this action', error: 'Forbidden', statusCode: 403 },
  })
  @ApiNotFoundResponse({
    description: 'The hotel or airline does not exist',
    example: { message: 'Airline not found', error: 'Not Found', statusCode: 404 },
  })
  @ApiConflictResponse({
    description: 'The provider is already active',
    example: { message: 'Airline is already active', error: 'Conflict', statusCode: 409 },
  })
  reactivateProvider(@Param('type', providerTypePipe) type: ProviderType, @Param('id') id: string) {
    return this.adminProvidersService.reactivateProvider(type, id);
  }
}