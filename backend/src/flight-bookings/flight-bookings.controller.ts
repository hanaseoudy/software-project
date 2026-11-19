import {
  Body,
  Controller,
  Get,
  Param,
  Post,
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
import { UserRole } from '../users/schemas/user.schema';
import { HoldFlightBookingDto } from './dto/hold-flight-booking.dto';
import { FlightBookingsService } from './flight-bookings.service';
import { ListMyBookingsDto } from './dto/list-my-bookings.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

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

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER) // check the real enum member name
  @ApiExtraModels(ListMyBookingsDto) // 👈 Registers the nested DTO schema too
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
  @ApiResponse({ status: 403, description: 'Caller is not a registered user' })
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
  @ApiResponse({ status: 403, description: 'Caller is not a registered user' })
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
}
