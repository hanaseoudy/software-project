import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
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

  @Get(':id/summary')
  @ApiOperation({
    summary: 'FLT-21: booking summary before payment (flight, passengers, baggage, total)',
    description:
      'Only the owner of the booking can read it. total = seat fares + baggage fees (the amount charged at payment).',
  })
  @ApiParam({ name: 'id', description: 'Flight booking id returned by POST /flight-bookings/hold' })
  @ApiOkResponse({
    description: 'Booking summary',
    schema: {
      example: {
        bookingId: '6af6f6e97a4b19aea096da0f',
        status: 'PENDING_PAYMENT',
        tripType: 'ONE_WAY',
        cabinClass: 'ECONOMY',
        holdExpiresAt: '2026-12-01T10:10:00.000Z',
        canPay: true,
        flights: [
          {
            segment: 'OUTBOUND',
            flightNumber: 'MS777',
            airlineName: 'EgyptAir',
            departureAirport: { iataCode: 'CAI', name: 'Cairo International', city: 'Cairo', timezone: 'Africa/Cairo' },
            arrivalAirport: { iataCode: 'DXB', name: 'Dubai International', city: 'Dubai', timezone: 'Asia/Dubai' },
            departureTime: '2026-12-05T10:00:00.000Z',
            arrivalTime: '2026-12-05T13:00:00.000Z',
            durationMinutes: 180,
          },
        ],
        passengers: [
          {
            firstName: 'Mariam',
            lastName: 'Mashoud',
            type: 'ADULT',
            dateOfBirth: '2002-05-20',
            documentType: 'PASSPORT',
            documentNumber: 'A12345678',
            baggage: [{ weightKg: 23, isExtra: false }],
            extraBags: 0,
          },
        ],
        baggage: { extraBags: 0, fees: 0 },
        pricing: { currency: 'USD', fareTotal: 100, baggageFees: 0, total: 100 },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid booking ID' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiNotFoundResponse({ description: 'Booking not found (or not yours)' })
  summary(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.flightBookingsService.getSummary(req.user!.sub, id);
  }
}
