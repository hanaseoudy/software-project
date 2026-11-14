import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { ACCESS_COOKIE } from '../auth/auth.cookies';
import { ValidationErrorResponseDto } from '../auth/dto/validation-error-response.dto';
import { AdminService } from './admin.service';
import { CreateModeratorDto } from './dto/create-moderator.dto';

@ApiTags('admin')
@ApiCookieAuth(ACCESS_COOKIE)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Post('moderators')
  @ApiOperation({
    summary: 'Create a hotel or airline moderator linked to exactly one provider (ACC-13)',
    description: 'The admin sets a temporary password; the moderator must change it on first login (mustChangePassword = true).',
  })
  @ApiCreatedResponse({
    description: 'Moderator created and assigned',
    schema: {
      example: {
        id: '6aef52048e9d356647b49fdc',
        firstName: 'Sara',
        lastName: 'Ali',
        email: 'sara@nilepalace.com',
        role: 'moderator',
        providerType: 'hotel',
        providerId: '6aef52048e9d356647b49abc',
        mustChangePassword: true,
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Validation failed; errors are grouped by field',
    type: ValidationErrorResponseDto,
    example: {
      message: 'Validation failed',
      errors: {
        temporaryPassword: ['Password must be at least 8 characters'],
        providerType: ['Provider type must be hotel or airline'],
      },
    },
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
    description: 'Email is already registered',
    type: ValidationErrorResponseDto,
    example: { message: 'Validation failed', errors: { email: ['Email is already registered'] } },
  })
  createModerator(@Body() dto: CreateModeratorDto) {
    return this.adminService.createModerator(dto);
  }
}