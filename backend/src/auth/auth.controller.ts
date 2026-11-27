import { Body, Controller, Get, HttpCode, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AllowPendingPasswordChange } from '../common/decorators/allow-pending-password-change.decorator';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './auth.cookies';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { PasswordResetService } from './password-reset.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordWithTokenDto } from './dto/reset-password-with-token.dto';
import { RegisterDto } from './dto/register.dto';
import { RegisterResponseDto } from './dto/register-response.dto';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ValidationErrorResponseDto } from './dto/validation-error-response.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private emailVerification: EmailVerificationService,
    private passwordReset: PasswordResetService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user account (ACC-01)' })
  @ApiCreatedResponse({ description: 'Account created', type: RegisterResponseDto })
  @ApiBadRequestResponse({
    description: 'Validation failed; errors are grouped by field',
    type: ValidationErrorResponseDto,
    example: {
      message: 'Validation failed',
      errors: {
        email: ['Email is invalid'],
        password: ['Password must be at least 8 characters', 'Password must contain at least one letter and one digit'],
        acceptTerms: ['You must accept the terms and privacy policy'],
      },
    },
  })
  @ApiConflictResponse({
    description: 'Email is already registered',
    type: ValidationErrorResponseDto,
    example: {
      message: 'Validation failed',
      errors: { email: ['Email is already registered'] },
    },
  })
  async register(@Body() dto: RegisterDto) {
    const user = await this.authService.register(dto);
    // ACC-02: sent in the background; a slow or failing email never blocks the registration.
    void this.emailVerification.sendVerificationEmail(user.id);
    return user;
  }

  @Get('verify-email')
  @ApiOperation({
    summary: 'Verify the email address with the token from the email link (ACC-02)',
    description: 'The link is valid for 24 hours and works once. A newer link replaces the old one. Booking is allowed afterwards.',
  })
  @ApiQuery({ name: 'token', required: true, description: 'The token from the verification link (?token=...)' })
  @ApiOkResponse({ description: 'Email verified', schema: { example: { message: 'Email verified' } } })
  @ApiBadRequestResponse({
    description: 'Missing, wrong, already used or expired token',
    example: { message: 'This verification link is invalid or has expired', error: 'Bad Request', statusCode: 400 },
  })
  verifyEmail(@Query() dto: VerifyEmailDto) {
    return this.emailVerification.verify(dto.token);
  }

  @Post('resend-verification')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth(ACCESS_COOKIE)
  @ApiOperation({
    summary: 'Send a new verification email to the logged-in user (ACC-02)',
    description:
      'For a user whose link expired or got lost. A new 24-hour link is emailed and the previous link stops working. Not in the project PDF; added so an unverified user is never stuck without a way to book.',
  })
  @ApiOkResponse({ description: 'A new link was sent; the old one stops working', schema: { example: { message: 'Verification email sent' } } })
  @ApiUnauthorizedResponse({
    description: 'Not logged in',
    example: { message: 'Not authenticated', error: 'Unauthorized', statusCode: 401 },
  })
  @ApiConflictResponse({
    description: 'The email address is already verified',
    example: { message: 'Your email address is already verified', error: 'Conflict', statusCode: 409 },
  })
  resendVerification(@Req() req: AuthenticatedRequest) {
    return this.emailVerification.resend(req.user!.sub);
  }

  @Post('forgot-password')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Ask for a password reset link by email (ACC-07)',
    description:
      'Always returns the same message, whether or not the email is registered. The link is valid for 30 minutes, works once, and a newer request makes older links stop working.',
  })
  @ApiOkResponse({
    description: 'Same reply for every email',
    schema: { example: { message: 'If an account exists for this email, a password reset link has been sent.' } },
  })
  @ApiBadRequestResponse({
    description: 'The email is not a valid email address',
    type: ValidationErrorResponseDto,
    example: { message: 'Validation failed', errors: { email: ['Email is invalid'] } },
  })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.passwordReset.requestReset(dto.email);
  }

  @Post('reset-password')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Set a new password with the token from the reset email (ACC-07)',
    description: 'The link works once and expires after 30 minutes. All sessions of the account are logged out.',
  })
  @ApiOkResponse({
    description: 'Password changed',
    schema: { example: { message: 'Password reset. You can now log in with your new password.' } },
  })
  @ApiBadRequestResponse({
    description: 'Invalid new password, or a wrong, used, replaced or expired token',
    example: { message: 'This reset link is invalid or has expired', error: 'Bad Request', statusCode: 400 },
  })
  resetPassword(@Body() dto: ResetPasswordWithTokenDto) {
    return this.passwordReset.resetPassword(dto.token, dto.newPassword);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Log in with email and password (ACC-04)',
    description: 'Starts a session and sets the access_token and refresh_token as httpOnly, Secure, SameSite=Strict cookies (ACC-19).',
  })
  @ApiOkResponse({
    description:
      'Logged in; role and providerType tell the frontend which home page to open, providerId which airline or hotel to load (ACC-04, ACC-19, FLT-01, HTL-01)',
    type: LoginResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Validation failed; errors are grouped by field',
    type: ValidationErrorResponseDto,
    example: { message: 'Validation failed', errors: { email: ['Email is invalid'] } },
  })
  @ApiUnauthorizedResponse({
    description: 'Wrong email or password (same generic message for both)',
    example: { message: 'Invalid email or password', error: 'Unauthorized', statusCode: 401 },
  })
  @ApiForbiddenResponse({
    description: 'Account is suspended',
    example: { message: 'Account suspended', error: 'Forbidden', statusCode: 403 },
  })
  @ApiResponse({
    status: 423,
    description: 'Locked for 15 minutes after 5 failed attempts in a row: returned on the 5th failure and on every try while locked (ACC-05)',
    schema: {
      example: {
        statusCode: 423,
        message: 'Account locked after too many failed login attempts. Try again in 15 minute(s).',
        error: 'Locked',
      },
    },
  })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, accessToken, refreshToken } = await this.authService.login(dto);
    this.authService.setAuthCookies(res, accessToken, refreshToken);
    return user;
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({
    summary: 'Get new tokens using the refresh_token cookie (ACC-06, ACC-19)',
    description: 'Rotates both cookies. Fails if the session was revoked, the refresh token was already used, or there was no authenticated request for 30 minutes.',
  })
  @ApiOkResponse({ description: 'New cookies set; returns the current user', type: LoginResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid, reused or expired refresh token, or idle session; cookies are cleared',
    example: { message: 'Not authenticated', error: 'Unauthorized', statusCode: 401 },
  })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const { user, accessToken, refreshToken } = await this.authService.refresh(req.cookies?.[REFRESH_COOKIE]);
      this.authService.setAuthCookies(res, accessToken, refreshToken);
      return user;
    } catch (err) {
      this.authService.clearAuthCookies(res);
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log out: revoke the session on the server and clear both cookies (ACC-06)' })
  @ApiOkResponse({ description: 'Logged out', schema: { example: { message: 'Logged out' } } })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(req.cookies?.[ACCESS_COOKIE], req.cookies?.[REFRESH_COOKIE]);
    this.authService.clearAuthCookies(res);
    return { message: 'Logged out' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @AllowPendingPasswordChange()
  @ApiCookieAuth(ACCESS_COOKIE)
  @ApiOperation({ summary: 'Get the currently logged-in user from the access_token cookie (ACC-19)' })
  @ApiOkResponse({
    description:
      'The current user; for moderators providerType and providerId tell which airline or hotel to load (ACC-04, ACC-19, FLT-01, HTL-01), null for users and admins',
    type: LoginResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid or expired cookie, revoked or idle session, or the account is no longer active',
    example: { message: 'Not authenticated', error: 'Unauthorized', statusCode: 401 },
  })
  me(@Req() req: AuthenticatedRequest) {
    return this.authService.me(req.user!.sub);
  }

  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  @AllowPendingPasswordChange()
  @ApiCookieAuth(ACCESS_COOKIE)
  @ApiOperation({
    summary: 'Change the password of the logged-in user (ACC-08)',
    description:
      'Checks the current password, saves the new one and sets mustChangePassword to false (ACC-13). Other sessions of this user are logged out; this one stays logged in.',
  })
  @ApiOkResponse({ description: 'Password changed', schema: { example: { message: 'Password changed' } } })
  @ApiBadRequestResponse({
    description: 'Validation failed, wrong current password, or the new password is the same as the current one',
    type: ValidationErrorResponseDto,
    example: { message: 'Validation failed', errors: { currentPassword: ['Current password is incorrect'] } },
  })
  @ApiUnauthorizedResponse({
    description: 'Not logged in, or the session is no longer valid',
    example: { message: 'Not authenticated', error: 'Unauthorized', statusCode: 401 },
  })
  changePassword(@Req() req: AuthenticatedRequest, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user!.sub, req.user!.sid, dto);
  }
}