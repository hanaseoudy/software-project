import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ACCESS_COOKIE } from '../auth/auth.cookies';
import { Roles } from '../common/decorators/roles.decorator';
import { type AuthenticatedRequest, JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentResponseDto, PaymentSessionResponseDto } from './dto/payment-response.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  @ApiCookieAuth(ACCESS_COOKIE)
  @ApiOperation({
    summary: 'Start paying for a Pending Payment booking (PAY-01)',
    description:
      'Registered user only, own booking only. The booking must be Pending Payment, within its hold (FLT-22 / HTL-18), with the provider policies accepted (PAY-02). Returns a Stripe clientSecret for Stripe Elements; the booking is confirmed only by the Stripe webhook.',
  })
  @ApiCreatedResponse({ type: PaymentSessionResponseDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({ description: 'Not a registered user, or provider policies not accepted (PAY-02)' })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  @ApiConflictResponse({ description: 'Not Pending Payment, hold expired, already paid, or last payment failed' })
  @ApiServiceUnavailableResponse({ description: 'Stripe is not configured' })
  create(@Body() dto: CreatePaymentDto, @Req() req: AuthenticatedRequest): Promise<PaymentSessionResponseDto> {
    return this.paymentsService.create(req.user!.sub, dto);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Stripe webhook (PAY-01)',
    description: 'Called by Stripe only. The Stripe-Signature header is verified before any payment outcome is applied.',
  })
  @ApiHeader({ name: 'stripe-signature', required: true })
  @ApiOkResponse({ description: 'Event received', example: { received: true } })
  @ApiBadRequestResponse({ description: 'Missing or invalid Stripe signature' })
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ received: true }> {
    await this.paymentsService.handleWebhook(req.rawBody, signature);
    return { received: true };
  }

  @Post(':id/retry')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  @ApiCookieAuth(ACCESS_COOKIE)
  @ApiOperation({
    summary: 'Retry a failed payment (PAY-01)',
    description: 'Own payment only, allowed until the booking hold expires.',
  })
  @ApiCreatedResponse({ type: PaymentSessionResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({ description: 'Not a registered user, or provider policies not accepted (PAY-02)' })
  @ApiNotFoundResponse({ description: 'Payment or booking not found' })
  @ApiConflictResponse({ description: 'Payment did not fail, or the hold has expired' })
  @ApiServiceUnavailableResponse({ description: 'Stripe is not configured' })
  retry(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<PaymentSessionResponseDto> {
    return this.paymentsService.retry(req.user!.sub, id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  @ApiCookieAuth(ACCESS_COOKIE)
  @ApiOperation({ summary: 'Get payment status (PAY-01)', description: 'Own payment only.' })
  @ApiOkResponse({ type: PaymentResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({ description: 'Not a registered user' })
  @ApiNotFoundResponse({ description: 'Payment not found' })
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<PaymentResponseDto> {
    return this.paymentsService.findOne(req.user!.sub, id);
  }
}
