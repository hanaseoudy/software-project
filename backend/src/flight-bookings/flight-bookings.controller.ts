import { Body, Controller, Get, Param, Post, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { HoldFlightBookingDto } from './dto/hold-flight-booking.dto';
import { FlightBookingsService } from './flight-bookings.service';

@ApiTags('Flight Bookings')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('flight-bookings')
export class FlightBookingsController {
  constructor(private readonly flightBookingsService: FlightBookingsService) {}

  @Post('hold')
  @UseGuards(RolesGuard)
  @Roles(UserRole.USER)
  @ApiOperation({
    summary:
      'FLT-22: atomically hold seats; creates a PENDING_PAYMENT booking valid for 10 minutes',
  })
  @ApiCreatedResponse({ description: 'Seats held, booking created' })
  @ApiBadRequestResponse({ description: 'Invalid passengers, trip type or flight' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiForbiddenResponse({ description: 'Only registered users can create bookings' })
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

  @Get(':id/confirmation')
  @ApiOperation({
    summary: 'FLT-23: confirmation page data (booking summary + booking reference)',
    description:
      'Only the owner can read it, and only after payment confirmed the booking (CONFIRMED or COMPLETED).',
  })
  @ApiParam({ name: 'id', description: 'Flight booking id' })
  @ApiOkResponse({ description: 'Booking summary with bookingReference (e.g. FLT-7K3M9QXA)' })
  @ApiBadRequestResponse({ description: 'Invalid booking ID' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiNotFoundResponse({ description: 'Booking not found (or not yours)' })
  @ApiConflictResponse({ description: 'Booking is not confirmed yet' })
  confirmation(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.flightBookingsService.getConfirmation(req.user!.sub, id);
  }

  @Get(':id/e-ticket')
  @ApiOperation({ summary: 'FLT-23: download the e-ticket (PDF) of a confirmed booking' })
  @ApiParam({ name: 'id', description: 'Flight booking id' })
  @ApiOkResponse({
    description: 'PDF file',
    content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiBadRequestResponse({ description: 'Invalid booking ID' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiNotFoundResponse({ description: 'Booking not found (or not yours)' })
  @ApiConflictResponse({ description: 'Booking is not confirmed yet' })
  async eTicket(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { filename, pdf } = await this.flightBookingsService.getETicket(req.user!.sub, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(pdf);
  }
}
