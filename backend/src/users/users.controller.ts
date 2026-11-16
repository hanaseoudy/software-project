import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard, type AuthPayload } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ACCESS_COOKIE } from '../auth/auth.cookies';
import { ValidationErrorResponseDto } from '../auth/dto/validation-error-response.dto';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

const PROFILE_EXAMPLE = {
  id: '6aef52048e9d356647b49fdc',
  firstName: 'Nour',
  lastName: 'Hossam',
  email: 'nour@example.com',
  phoneNumber: '+201001234567',
  role: 'user',
  preferredCurrency: 'USD',
};

const NOT_AUTHENTICATED = {
  description: 'Not logged in, or the session is no longer valid',
  example: { message: 'Not authenticated', error: 'Unauthorized', statusCode: 401 },
};

@ApiTags('users')
@ApiCookieAuth(ACCESS_COOKIE)
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: "Get the logged-in user's profile (ACC-09, ACC-11)" })
  @ApiOkResponse({ description: 'The profile', schema: { example: PROFILE_EXAMPLE } })
  @ApiUnauthorizedResponse(NOT_AUTHENTICATED)
  getProfile(@CurrentUser() user: AuthPayload) {
    return this.usersService.getProfile(user.sub);
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Edit name, phone number and preferred currency (ACC-09)',
    description:
      'Send only the fields to change. If any field is invalid nothing is saved. Email and role cannot be changed here and are ignored.',
  })
  @ApiOkResponse({ description: 'Saved; returns the updated profile', schema: { example: PROFILE_EXAMPLE } })
  @ApiBadRequestResponse({
    description: 'Validation failed (nothing was saved), or the body has no editable field',
    type: ValidationErrorResponseDto,
    example: {
      message: 'Validation failed',
      errors: {
        phoneNumber: ['Phone number must be 7 to 15 digits and may start with +'],
        preferredCurrency: ['Preferred currency must be one of: EGP, USD, EUR, GBP, SAR, AED, JPY'],
      },
    },
  })
  @ApiUnauthorizedResponse(NOT_AUTHENTICATED)
  updateProfile(@CurrentUser() user: AuthPayload, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.sub, dto);
  }
}