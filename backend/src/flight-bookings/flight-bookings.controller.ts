import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { HoldFlightBookingDto } from './dto/hold-flight-booking.dto';
import { FlightBookingsService } from './flight-bookings.service';

@ApiTags('Flight Bookings')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('flight-bookings')
export class FlightBookingsController {
  constructor(private readonly flightBookingsService: FlightBookingsService) {}

  @Post('hold')
  @ApiOperation({
    summary:
      'FLT-22: atomically hold seats; creates a PENDING_PAYMENT booking valid for 10 minutes',
  })
  @ApiCreatedResponse({ description: 'Seats held, booking created' })
  @ApiBadRequestResponse({ description: 'Invalid passengers, trip type or flight' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiNotFoundResponse({ description: 'Flight not found' })
  @ApiConflictResponse({ description: 'Not enough seats available' })
  hold(@Req() req: AuthenticatedRequest, @Body() dto: HoldFlightBookingDto) {
    return this.flightBookingsService.createHold(req.user!.sub, dto);
  }
}
