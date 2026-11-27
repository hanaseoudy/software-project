import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Patch,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
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
  ApiResponse,
  ApiExtraModels,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type {
  AuthenticatedRequest,
  AuthPayload,
} from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequireVerifiedEmail } from '../common/decorators/require-verified-email.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { CancelFlightBookingDto } from './dto/cancel-flight-booking.dto';
import { ChangeFlightBookingDto, ChangeFlightQueryDto } from './dto/change-flight-booking.dto';
import { FlightCancellationService } from './flight-cancellation.service';
import { FlightChangeService } from './flight-change.service';
import { HoldFlightBookingDto } from './dto/hold-flight-booking.dto';
import { FlightBookingsService } from './flight-bookings.service';
import { ListMyBookingsDto } from './dto/list-my-bookings.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SelectFlightSeatsDto } from './dto/select-flight-seats.dto';

@ApiTags('Flight Bookings')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('flight-bookings')
export class FlightBookingsController {
  constructor(
    private readonly flightBookingsService: FlightBookingsService,
    private readonly flightCancellationService: FlightCancellationService,
    private readonly flightChangeService: FlightChangeService,
  ) {}

  // POST /flight-bookings is the path of the requirements table (FLT-19/FLT-21);
  // POST /flight-bookings/hold is kept for the existing clients. Same handler.
  @Post(['', 'hold'])
  @UseGuards(RolesGuard)
  @RequireVerifiedEmail() // ACC-02: email must be verified before booking
  @Roles(UserRole.USER)
  @ApiOperation({
    summary:
      'FLT-19/FLT-21/FLT-22: enter passengers and baggage and atomically hold seats; creates a PENDING_PAYMENT booking valid for 10 minutes (also available as POST /flight-bookings/hold)',
  })
  @ApiCreatedResponse({ description: 'Seats held, booking created' })
  @ApiBadRequestResponse({
    description: 'Invalid passengers, trip type or flight',
  })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiForbiddenResponse({
    description: 'Only registered users can create bookings',
  })
  @ApiNotFoundResponse({ description: 'Flight not found' })
  @ApiConflictResponse({ description: 'Not enough seats available' })
  hold(@Req() req: AuthenticatedRequest, @Body() dto: HoldFlightBookingDto) {
    return this.flightBookingsService.createHold(req.user!.sub, dto);
  }

  @Patch(':id/seat')
  @UseGuards(RolesGuard)
  @Roles(UserRole.USER)
  @ApiOperation({
    summary: 'FLT-28: select seats for passengers on a pending flight booking',
  })
  @ApiParam({ name: 'id', description: 'Flight booking id' })
  @ApiOkResponse({ description: 'Passenger seat selections saved' })
  @ApiBadRequestResponse({ description: 'Invalid passenger or seat selection' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiForbiddenResponse({ description: 'Only registered users can select seats' })
  @ApiNotFoundResponse({ description: 'Booking not found or not owned by the user' })
  @ApiConflictResponse({ description: 'Booking expired, already paid, or seat is occupied' })
  selectSeats(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: SelectFlightSeatsDto,
  ) {
    return this.flightBookingsService.selectSeats(req.user!.sub, id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER) // check the real enum member name
  @ApiExtraModels(ListMyBookingsDto)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'List my flight bookings by group (FLT-25)',
    description:
      "Returns one tray per request: upcoming, past or cancelled. 10 bookings per page. Only the logged-in user's own bookings are returned.",
  })
  @ApiResponse({
    status: 200,
    description: 'One page of booking cards for the chosen group',
    schema: {
      example: {
        items: [
          {
            id: '6af2f1a40198023d25121300',
            bookingReference: 'FB7K2M9Q',
            status: 'CONFIRMED',
            tripType: 'ROUND_TRIP',
            cabinClass: 'ECONOMY',
            passengers: ['Sara Hassan', 'Omar Hassan'],
            totalPrice: 620,
            currency: 'USD',
            outbound: {
              flightNumber: 'MS777',
              departureUtc: '2026-12-05T08:00:00.000Z',
            },
            return: {
              flightNumber: 'MS778',
              departureUtc: '2026-12-12T09:00:00.000Z',
            },
          },
        ],
        page: 1,
        pageSize: 10,
        total: 1,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid group or page value' })
  @ApiResponse({ status: 401, description: 'Not logged in' })
  @ApiResponse({
    status: 404,
    description: 'Booking not found, or it belongs to another user',
  })
  list(@Query() dto: ListMyBookingsDto, @CurrentUser() user: AuthPayload) {
    return this.flightBookingsService.findMine(user.sub, dto);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Open one of my flight bookings (FLT-25)',
    description:
      'Full details of a single booking. A booking that belongs to another user is reported as not found.',
  })
  @ApiParam({
    name: 'id',
    description: 'MongoDB ObjectId of the flight booking',
  })
  @ApiResponse({
    status: 200,
    description:
      'Full booking details, including flights, passengers and refund',
  })
  @ApiResponse({ status: 400, description: 'Invalid booking id format' })
  @ApiResponse({ status: 401, description: 'Not logged in' })
  @ApiResponse({
    status: 404,
    description: 'Booking not found, or it belongs to another user',
  })
  details(@Param('id') id: string, @CurrentUser() user: AuthPayload) {
    return this.flightBookingsService.findMineById(user.sub, id);
  }

  @Get(':id/summary')
  @ApiOperation({
    summary:
      'FLT-21: booking summary before payment (flight, passengers, baggage, total)',
    description:
      'Only the owner of the booking can read it. total = seat fares + baggage fees (the amount charged at payment).',
  })
  @ApiParam({
    name: 'id',
    description: 'Flight booking id returned by POST /flight-bookings/hold',
  })
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
            departureAirport: {
              iataCode: 'CAI',
              name: 'Cairo International',
              city: 'Cairo',
              timezone: 'Africa/Cairo',
            },
            arrivalAirport: {
              iataCode: 'DXB',
              name: 'Dubai International',
              city: 'Dubai',
              timezone: 'Asia/Dubai',
            },
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
        pricing: {
          currency: 'USD',
          fareTotal: 100,
          baggageFees: 0,
          total: 100,
        },
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
    summary:
      'FLT-23: confirmation page data (booking summary + booking reference)',
    description:
      'Only the owner can read it, and only after payment confirmed the booking (CONFIRMED or COMPLETED).',
  })
  @ApiParam({ name: 'id', description: 'Flight booking id' })
  @ApiOkResponse({
    description: 'Booking summary with bookingReference (e.g. FLT-7K3M9QXA)',
  })
  @ApiBadRequestResponse({ description: 'Invalid booking ID' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiNotFoundResponse({ description: 'Booking not found (or not yours)' })
  @ApiConflictResponse({ description: 'Booking is not confirmed yet' })
  confirmation(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.flightBookingsService.getConfirmation(req.user!.sub, id);
  }

  @Get(':id/e-ticket')
  @ApiOperation({
    summary: 'FLT-23: download the e-ticket (PDF) of a confirmed booking',
  })
  @ApiParam({ name: 'id', description: 'Flight booking id' })
  @ApiOkResponse({
    description: 'PDF file',
    content: {
      'application/pdf': { schema: { type: 'string', format: 'binary' } },
    },
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
    const { filename, pdf } = await this.flightBookingsService.getETicket(
      req.user!.sub,
      id,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(pdf);
  }

  @Get(':id/cancellation-quote')
  @ApiOperation({
    summary: 'FLT-26: refund amount the user would get if they cancel now',
    description:
      'Computed from the airline cancellation tiers (FLT-09) and the days left until departure. Only for your own CONFIRMED booking before departure.',
  })
  @ApiParam({ name: 'id', description: 'Flight booking id' })
  @ApiOkResponse({
    description: 'Refund preview',
    schema: {
      example: {
        bookingId: '6afce9de50d54970bd83ecf8',
        departureTime: '2026-12-05T10:00:00.000Z',
        paidAmount: 120,
        currency: 'USD',
        refundAmount: 60,
        refundPercent: 50,
        appliedPolicy: {
          source: 'FLT-09 airline cancellation tiers',
          daysRemaining: 4,
          daysBeforeDeparture: 3,
          refundPercent: 50,
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid booking ID' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiNotFoundResponse({ description: 'Booking not found (or not yours)' })
  @ApiConflictResponse({
    description: 'Booking is not confirmed, or the flight already departed',
  })
  cancellationQuote(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.flightCancellationService.getQuote(req.user!.sub, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'FLT-26: cancel your own CONFIRMED flight booking before departure (refund by airline tiers)',
    description:
      'Send { "confirm": true } after viewing GET :id/cancellation-quote. The booking becomes CANCELLED, its seats return to inventory and a refund is created (PAY-03).',
  })
  @ApiParam({ name: 'id', description: 'Flight booking id' })
  @ApiOkResponse({ description: 'Booking cancelled, with the refund created' })
  @ApiBadRequestResponse({ description: 'Invalid booking ID or confirm is not true' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiNotFoundResponse({ description: 'Booking not found (or not yours)' })
  @ApiConflictResponse({
    description: 'Booking is not confirmed, or the flight already departed',
  })
  cancel(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CancelFlightBookingDto,
  ) {
    return this.flightCancellationService.cancel(req.user!.sub, id, dto);
  }

  @Get(':id/change-quote')
  @UseGuards(RolesGuard)
  @Roles(UserRole.USER)
  @ApiOperation({
    summary: 'FLT-27: new fare and fare difference if you change your flight(s)',
    description:
      'Pass outboundFlightId and/or returnFlightId (same route and cabin as the booked ones). difference > 0: you pay it via Stripe; difference < 0: it is refunded; 0: nothing to pay. Only for your own CONFIRMED booking before departure.',
  })
  @ApiParam({ name: 'id', description: 'Flight booking id' })
  @ApiOkResponse({
    description: 'Fare comparison',
    schema: {
      example: {
        bookingId: '6afce9de50d54970bd83ecf8',
        cabinClass: 'ECONOMY',
        currency: 'USD',
        current: { outboundFlightId: '6af...1', returnFlightId: null, amount: 100 },
        proposed: { outboundFlightId: '6af...2', returnFlightId: null, amount: 130 },
        difference: 30,
        outcome: 'PAY_DIFFERENCE',
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid ID, other route, flight not bookable, or the same flight' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiForbiddenResponse({ description: 'Only registered users can change bookings' })
  @ApiNotFoundResponse({ description: 'Booking or flight not found (or not yours)' })
  @ApiConflictResponse({ description: 'Booking is not confirmed, or the flight already departed' })
  changeQuote(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: ChangeFlightQueryDto,
  ) {
    return this.flightChangeService.getQuote(req.user!.sub, id, query);
  }

  @Patch(':id/change-flight')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles(UserRole.USER)
  @ApiOperation({
    summary: 'FLT-27: change the flight(s) of your own CONFIRMED booking (same route and cabin)',
    description:
      'Send { "confirm": true, "outboundFlightId"?, "returnFlightId"? } after viewing GET :id/change-quote. Same or lower fare: the change is applied at once (a lower fare is refunded). Higher fare: the new seats are held for 10 minutes and the response carries a Stripe clientSecret for the difference; the booking changes when it is paid.',
  })
  @ApiParam({ name: 'id', description: 'Flight booking id' })
  @ApiOkResponse({ description: 'Change completed, or waiting for payment (status PENDING_PAYMENT with clientSecret)' })
  @ApiBadRequestResponse({ description: 'Invalid ID, confirm is not true, other route or flight not bookable' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiForbiddenResponse({ description: 'Only registered users can change bookings' })
  @ApiNotFoundResponse({ description: 'Booking or flight not found (or not yours)' })
  @ApiConflictResponse({
    description: 'Booking is not confirmed, flight departed, not enough seats, or a change is already waiting for payment',
  })
  change(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ChangeFlightBookingDto,
  ) {
    return this.flightChangeService.requestChange(req.user!.sub, id, dto);
  }

  @Get(':id/changes/:changeId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'FLT-27: status of a change request (e.g. after paying the fare difference)' })
  @ApiParam({ name: 'id', description: 'Flight booking id' })
  @ApiParam({ name: 'changeId', description: 'Change id returned by PATCH :id/change-flight' })
  @ApiOkResponse({ description: 'PENDING_PAYMENT, COMPLETED, EXPIRED or FAILED' })
  @ApiBadRequestResponse({ description: 'Invalid ID' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiForbiddenResponse({ description: 'Only registered users can change bookings' })
  @ApiNotFoundResponse({ description: 'Change not found (or not yours)' })
  changeStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('changeId') changeId: string,
  ) {
    return this.flightChangeService.getChange(req.user!.sub, id, changeId);
  }
}