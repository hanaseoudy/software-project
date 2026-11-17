import { Body, Controller, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { ACCESS_COOKIE } from '../auth/auth.cookies';
import { ValidationErrorResponseDto } from '../auth/dto/validation-error-response.dto';
import { AdminService } from './admin.service';
import { CreateModeratorDto } from './dto/create-moderator.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

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
  createModerator(@Req() req: AuthenticatedRequest, @Body() dto: CreateModeratorDto) {
    return this.adminService.createModerator(dto, req.user?.sub);
  }

  @Post('users/:id/reset-password')
  @HttpCode(200)
  @ApiOperation({
    summary: "Reset a user's or moderator's password to a temporary password (ACC-07a)",
    description:
      'Sets mustChangePassword = true, clears any login lockout and logs the account out everywhere. At the next login the account must set a new password with PATCH /api/auth/change-password (ACC-08).',
  })
  @ApiOkResponse({
    description: 'Password reset',
    schema: {
      example: { id: '6aef52048e9d356647b49fdc', email: 'nour@example.com', role: 'user', mustChangePassword: true },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid user ID, or the temporary password breaks the password rules',
    type: ValidationErrorResponseDto,
    example: {
      message: 'Validation failed',
      errors: { temporaryPassword: ['Password must contain at least one letter and one digit'] },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Not logged in',
    example: { message: 'Not authenticated', error: 'Unauthorized', statusCode: 401 },
  })
  @ApiForbiddenResponse({
    description: 'Caller is not an admin, or the target account is an admin',
    example: { message: "An admin's password cannot be reset here", error: 'Forbidden', statusCode: 403 },
  })
  @ApiNotFoundResponse({
    description: 'No account with this id',
    example: { message: 'User not found', error: 'Not Found', statusCode: 404 },
  })
  resetPassword(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.adminService.resetPassword(id, dto, req.user?.sub);
  }

  @Patch('accounts/:id/suspend')
  @ApiOperation({
    summary: 'Suspend a user or moderator account (ACC-16, ACC-15)',
    description:
      'The account can no longer log in and is logged out everywhere. Its bookings stay valid and its content stays visible.',
  })
  @ApiOkResponse({
    description: 'Account suspended',
    schema: { example: { id: '6aef52048e9d356647b49fdc', email: 'nour@example.com', role: 'user', status: 'suspended' } },
  })
  @ApiBadRequestResponse({
    description: 'Invalid user ID',
    example: { message: 'Invalid user ID', error: 'Bad Request', statusCode: 400 },
  })
  @ApiUnauthorizedResponse({
    description: 'Not logged in',
    example: { message: 'Not authenticated', error: 'Unauthorized', statusCode: 401 },
  })
  @ApiForbiddenResponse({
    description: 'Caller is not an admin, or the target account is an admin',
    example: { message: 'An admin account cannot be suspended', error: 'Forbidden', statusCode: 403 },
  })
  @ApiNotFoundResponse({
    description: 'No account with this id',
    example: { message: 'User not found', error: 'Not Found', statusCode: 404 },
  })
  @ApiConflictResponse({
    description: 'The account is already suspended or is deactivated',
    example: { message: 'Account is already suspended', error: 'Conflict', statusCode: 409 },
  })
  suspendAccount(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.adminService.suspendAccount(id, req.user?.sub);
  }

  @Patch('accounts/:id/reactivate')
  @ApiOperation({ summary: 'Reactivate a suspended user or moderator account (ACC-16, ACC-15)' })
  @ApiOkResponse({
    description: 'Account reactivated; it can log in again',
    schema: { example: { id: '6aef52048e9d356647b49fdc', email: 'nour@example.com', role: 'user', status: 'active' } },
  })
  @ApiBadRequestResponse({
    description: 'Invalid user ID',
    example: { message: 'Invalid user ID', error: 'Bad Request', statusCode: 400 },
  })
  @ApiUnauthorizedResponse({
    description: 'Not logged in',
    example: { message: 'Not authenticated', error: 'Unauthorized', statusCode: 401 },
  })
  @ApiForbiddenResponse({
    description: 'Caller is not an admin, or the target account is an admin',
    example: { message: 'An admin account cannot be reactivated', error: 'Forbidden', statusCode: 403 },
  })
  @ApiNotFoundResponse({
    description: 'No account with this id',
    example: { message: 'User not found', error: 'Not Found', statusCode: 404 },
  })
  @ApiConflictResponse({
    description: 'The account is not suspended',
    example: { message: 'Only a suspended account can be reactivated', error: 'Conflict', statusCode: 409 },
  })
  reactivateAccount(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.adminService.reactivateAccount(id, req.user?.sub);
  }
}