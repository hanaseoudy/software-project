import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { HoldHotelBookingDto } from './dto/hold-hotel-booking.dto';
import { HotelBookingsService } from './hotel-bookings.service';

@ApiTags('Hotel Bookings')
@Controller('hotel-bookings')
export class HotelBookingsController {
  constructor(private readonly hotelBookingsService: HotelBookingsService) {}

  // TODO: add the auth guard once it is available (userId comes from req.user).
  @Post()
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
      'Invalid dates (check-out not after check-in, check-in in the past), duplicate room, room from another hotel, or too many guests',
    example: {
      message: 'checkOut must be after checkIn',
      error: 'Bad Request',
      statusCode: 400,
    },
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
      'A room is blocked, or already reserved (confirmed reservation or unexpired hold); nothing was held',
    example: {
      message: 'One or more rooms are already reserved for the selected dates',
      error: 'Conflict',
      statusCode: 409,
    },
  })
  hold(
    @Req() req: { user?: { id?: string; userId?: string; sub?: string } },
    @Body() dto: HoldHotelBookingDto,
  ) {
    const userId = req.user?.id ?? req.user?.userId ?? req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }
    return this.hotelBookingsService.createHold(userId, dto);
  }
}
