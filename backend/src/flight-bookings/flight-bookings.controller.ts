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
import { HoldFlightBookingDto } from './dto/hold-flight-booking.dto';
import { FlightBookingsService } from './flight-bookings.service';

@ApiTags('Flight Bookings')
@Controller('flight-bookings')
export class FlightBookingsController {
  constructor(private readonly flightBookingsService: FlightBookingsService) {}

  // TODO(ACC-04): add the JWT auth guard here once the login PR is merged.
  @Post('hold')
  @ApiOperation({
    summary:
      'FLT-22: atomically hold seats; creates a PENDING_PAYMENT booking valid for 10 minutes',
  })
  @ApiCreatedResponse({ description: 'Seats held, booking created' })
  @ApiBadRequestResponse({ description: 'Invalid passengers, trip type or flight' })
  @ApiNotFoundResponse({ description: 'Flight not found' })
  @ApiConflictResponse({ description: 'Not enough seats available' })
  hold(
    @Req() req: { user?: { id?: string; userId?: string; sub?: string } },
    @Body() dto: HoldFlightBookingDto,
  ) {
    const userId = req.user?.id ?? req.user?.userId ?? req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }
    return this.flightBookingsService.createHold(userId, dto);
  }
}