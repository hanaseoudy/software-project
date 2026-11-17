import {
  Body,
  Controller,
  Post,
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
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { HoldHotelBookingDto } from './dto/hold-hotel-booking.dto';
import { HotelBookingsService } from './hotel-bookings.service';

@ApiTags('Hotel Bookings')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('hotel-bookings')
export class HotelBookingsController {
  constructor(private readonly hotelBookingsService: HotelBookingsService) {}

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
}
