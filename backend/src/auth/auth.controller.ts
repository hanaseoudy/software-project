import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { ACCESS_COOKIE } from './auth.cookies';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterResponseDto } from './dto/register-response.dto';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { ValidationErrorResponseDto } from './dto/validation-error-response.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

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
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Log in with email and password (ACC-04)',
    description: 'Sets the access_token and refresh_token as httpOnly, Secure, SameSite=Strict cookies (ACC-19).',
  })
  @ApiOkResponse({ description: 'Logged in; role and providerType tell the frontend which home page to open', type: LoginResponseDto })
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
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, accessToken, refreshToken } = await this.authService.login(dto);
    this.authService.setAuthCookies(res, accessToken, refreshToken);
    return user;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth(ACCESS_COOKIE)
  @ApiOperation({ summary: 'Get the currently logged-in user from the access_token cookie (ACC-19)' })
  @ApiOkResponse({ description: 'The current user', type: LoginResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid or expired cookie, or the account is no longer active',
    example: { message: 'Not authenticated', error: 'Unauthorized', statusCode: 401 },
  })
  me(@Req() req: AuthenticatedRequest) {
    return this.authService.me(req.user!.sub);
  }
}