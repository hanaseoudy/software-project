import { Body, Controller, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RegisterResponseDto } from './dto/register-response.dto';
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
}