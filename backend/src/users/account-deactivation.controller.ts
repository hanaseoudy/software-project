import { Body, Controller, Delete, HttpCode, Res, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard, type AuthPayload } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ACCESS_COOKIE, REFRESH_COOKIE, REFRESH_COOKIE_PATH, clearCookieOptions } from '../auth/auth.cookies';
import { ValidationErrorResponseDto } from '../auth/dto/validation-error-response.dto';
import { AccountDeactivationService } from './account-deactivation.service';
import { DeactivateAccountDto } from './dto/deactivate-account.dto';

@ApiTags('users')
@ApiCookieAuth(ACCESS_COOKIE)
@UseGuards(JwtAuthGuard)
@Controller('users')
export class AccountDeactivationController {
  constructor(private accountDeactivationService: AccountDeactivationService) {}

  @Delete('me')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Deactivate my own account (ACC-12)',
    description:
      'Confirm with the current password. Blocked while you have upcoming Confirmed bookings. Afterwards you cannot log in, you are logged out everywhere, your posts and public itineraries are hidden, and your comments and reviews show as "Deleted user".',
  })
  @ApiOkResponse({ description: 'Account deactivated; both cookies are cleared', schema: { example: { message: 'Account deactivated' } } })
  @ApiBadRequestResponse({
    description: 'Password missing or incorrect',
    type: ValidationErrorResponseDto,
    example: { message: 'Validation failed', errors: { password: ['Password is incorrect'] } },
  })
  @ApiUnauthorizedResponse({
    description: 'Not logged in',
    example: { message: 'Not authenticated', error: 'Unauthorized', statusCode: 401 },
  })
  @ApiForbiddenResponse({
    description: 'Admins and moderators cannot deactivate their own account',
    example: { message: 'Only registered users can deactivate their own account', error: 'Forbidden', statusCode: 403 },
  })
  @ApiConflictResponse({
    description: 'The user has upcoming Confirmed bookings',
    example: {
      message:
        'You have upcoming confirmed bookings. Cancel them or wait until they are completed before deactivating your account.',
      error: 'Conflict',
      statusCode: 409,
    },
  })
  async deactivate(
    @CurrentUser() user: AuthPayload,
    @Body() dto: DeactivateAccountDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.accountDeactivationService.deactivate(user.sub, dto);
    res.clearCookie(ACCESS_COOKIE, clearCookieOptions());
    res.clearCookie(REFRESH_COOKIE, clearCookieOptions(REFRESH_COOKIE_PATH));
    return result;
  }
}