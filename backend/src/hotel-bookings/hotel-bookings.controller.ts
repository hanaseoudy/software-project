import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
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
import { ValidationErrorResponseDto } from '../auth/dto/validation-error-response.dto';
import { ErrorResponseDto } from '../blog/dto/error-response.dto';
import { StrictBody } from '../blog/strict-body.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { CreateReviewDto } from './dto/create-review.dto';
import { HoldHotelBookingDto } from './dto/hold-hotel-booking.dto';
import { ReviewResponseDto } from './dto/review-response.dto';
import { HotelBookingsService } from './hotel-bookings.service';
import { ReviewsService } from './reviews.service';
import {
  MyReservationsPageDto,
  MyReservationsQueryDto,
  ReservationDetailsDto,
} from './dto/reservation-views.dto';
import { HotelReservationsService } from './hotel-reservations.service';

@ApiTags('Hotel Bookings')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('hotel-bookings')
export class HotelBookingsController {
  constructor(
    private readonly hotelBookingsService: HotelBookingsService,
    private readonly reviewsService: ReviewsService,
    private readonly reservations: HotelReservationsService,
  ) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.USER)
  @ApiOperation({
    summary:
      'HTL-18: atomically hold all selected rooms together for 10 minutes (PENDING_PAYMENT)',
  })
  @ApiCreatedResponse({
    description: 'Rooms held, one PENDING_PAYMENT reservation created',
    example: {
      _id: '6aef955ba30ad0ab222602e9',
      hotel: '6aef930b9e8df6e7c5a939d1',
      rooms: [
        { room: '6aef930b9e8df6e7c5a939d2', pricePerNight: 100, adults: 2, children: 0 },
        { room: '6aef930b9e8df6e7c5a939d3', pricePerNight: 120, adults: 1, children: 1 },
      ],
      checkIn: '2026-12-20T00:00:00.000Z',
      checkOut: '2026-12-23T00:00:00.000Z',
      totalPrice: 660,
      status: 'PENDING_PAYMENT',
      holdExpiresAt: '2026-11-08T16:40:00.000Z',
    },
  })
  @ApiBadRequestResponse({
    description:
      'Invalid dates (not a real YYYY-MM-DD date, check-out not after check-in, check-in in the past), duplicate room, room from another hotel, or too many guests',
    example: {
      message: 'checkOut must be after checkIn',
      error: 'Bad Request',
      statusCode: 400,
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  @ApiForbiddenResponse({
    description: 'Only registered users can create bookings',
  })
  @ApiNotFoundResponse({
    description: 'Hotel (or one of the rooms) not found or not available',
    example: {
      message: 'One or more rooms were not found',
      error: 'Not Found',
      statusCode: 404,
    },
  })
  @ApiConflictResponse({
    description:
      'A room is blocked, not fully available for every night, or already reserved (confirmed reservation or unexpired hold); nothing was held',
    example: {
      message: 'One or more rooms are already reserved for the selected dates',
      error: 'Conflict',
      statusCode: 409,
    },
  })
  hold(@Req() req: AuthenticatedRequest, @Body() dto: HoldHotelBookingDto) {
    return this.hotelBookingsService.createHold(req.user!.sub, dto);
  }

  @Post(':id/review')
  @ApiOperation({
    summary: 'HTL-23: rate and review a completed reservation',
    description:
      'Registered user, own reservation only. One rating (whole number 1 to 5) and an optional review text ' +
      '(up to 1000 characters, trimmed; an empty text counts as none) per Completed reservation, regardless of ' +
      'the number of rooms. A reservation counts as Completed once its status is COMPLETED, or it is CONFIRMED ' +
      'and its check-out date has passed. The hotel average rating and number of ratings are recalculated. ' +
      'Unknown body fields are rejected.',
  })
  @ApiParam({ name: 'id', description: 'Reservation id', example: '6aef955ba30ad0ab222602e9' })
  @ApiCreatedResponse({ description: 'Review created', type: ReviewResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid rating or comment, or an unknown field',
    type: ValidationErrorResponseDto,
    example: { message: 'Validation failed', errors: { rating: ['Rating must be at most 5'] } },
  })
  @ApiUnauthorizedResponse({ description: 'Not logged in', type: ErrorResponseDto })
  @ApiForbiddenResponse({
    description: 'The reservation belongs to another user',
    type: ErrorResponseDto,
    example: { statusCode: 403, message: 'You can only review your own reservations', error: 'Forbidden' },
  })
  @ApiNotFoundResponse({
    description: 'Reservation not found (or invalid id)',
    type: ErrorResponseDto,
    example: { statusCode: 404, message: 'Reservation not found', error: 'Not Found' },
  })
  @ApiConflictResponse({
    description: 'The reservation is not completed yet, or it already has a review',
    type: ErrorResponseDto,
    example: {
      statusCode: 409,
      message: 'You can review a reservation only after it is completed',
      error: 'Conflict',
    },
  })
  review(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @StrictBody() dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.create(req.user?.sub, id, dto);
  }

  // "mine" is declared before ":id" so it is never read as a reservation id.
  @Get('mine')
  @UseGuards(RolesGuard)
  @Roles(UserRole.USER)
  @ApiOperation({
    summary: 'HTL-20: my hotel reservations, grouped as upcoming, past or cancelled',
    description:
      'Registered users only. Choose a group with ?group=upcoming (default), past or cancelled; 10 per page. upcoming: Confirmed stays that have not ended yet. past: Completed stays. cancelled: Cancelled reservations. Each reservation shows the booking reference, hotel, rooms, dates, guests, total and status. The response also gives the size of all three groups in counts. Unpaid holds are not reservations and are never listed.',
  })
  @ApiOkResponse({ type: MyReservationsPageDto })
  @ApiBadRequestResponse({
    description: 'Validation failed; errors are grouped by field',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Only registered users have reservations' })
  listMine(
    @Req() req: AuthenticatedRequest,
    @Query() query: MyReservationsQueryDto,
  ): Promise<MyReservationsPageDto> {
    return this.reservations.listMine(req.user!.sub, query);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.USER)
  @ApiOperation({
    summary: 'HTL-20: full details of one of my hotel reservations',
    description:
      'Registered users only, and only their own reservation (another guest\'s reservation returns 404).',
  })
  @ApiOkResponse({ type: ReservationDetailsDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Only registered users have reservations' })
  @ApiNotFoundResponse({ description: 'Reservation not found (or not yours)' })
  getMine(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<ReservationDetailsDto> {
    return this.reservations.getMine(req.user!.sub, id);
  }
}
