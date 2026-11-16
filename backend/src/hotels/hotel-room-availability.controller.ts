import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AvailableRoomsPageDto } from './dto/available-room.dto';
import { AvailableRoomsQueryDto } from './dto/available-rooms-query.dto';
import { HotelRoomAvailabilityService } from './hotel-room-availability.service';

// Public route: guests can view the free rooms without logging in (HTL-15).
@ApiTags('Hotels')
@Controller('hotels')
export class HotelRoomAvailabilityController {
  constructor(private readonly service: HotelRoomAvailabilityService) {}

  @Get(':id/rooms/available')
  @ApiOperation({
    summary: "List a hotel's rooms that are free for the searched dates (HTL-15)",
    description:
      'Open to guests and registered users. Send the check-in and check-out dates. Lists every active room of the hotel that is free for the whole stay (not blocked, not reserved or held, inside a bookable range), with type, beds, maximum occupancy, price per night and the total stay price (nights x price per night). The room ids are used to select rooms for booking. Check-out must be after check-in and check-in cannot be in the past. Results are paginated, 10 per page, sorted by room number.',
  })
  @ApiParam({ name: 'id', description: 'Hotel id' })
  @ApiOkResponse({
    description: 'One page of free rooms (empty when none are free)',
    type: AvailableRoomsPageDto,
  })
  @ApiBadRequestResponse({
    description: 'Validation failed; errors are grouped by field',
    example: {
      message: 'Validation failed',
      errors: { checkOut: ['Check-out must be after check-in'] },
    },
  })
  @ApiNotFoundResponse({ description: 'Hotel not found or not active' })
  findAvailable(
    @Param('id') id: string,
    @Query() query: AvailableRoomsQueryDto,
  ): Promise<AvailableRoomsPageDto> {
    return this.service.findAvailable(id, query);
  }
}
