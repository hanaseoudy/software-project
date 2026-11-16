import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { HotelDetailsQueryDto } from './dto/hotel-details-query.dto';
import { HotelDetailsResponseDto } from './dto/hotel-details-response.dto';
import { HotelsService } from './hotels.service';

/** HTL-02: public (guests and registered users), so it has no login guard. */
@ApiTags('Hotels')
@Controller('hotels')
export class HotelDetailsController {
  constructor(private readonly hotelsService: HotelsService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Hotel details page (HTL-02)',
    description:
      'Public: no login needed. Shows the profile, photos, amenities, check-in/check-out times, cancellation policy, average rating and recent reviews. Send checkIn and checkOut (YYYY-MM-DD) together to also get the rooms that are free for the whole stay.',
  })
  @ApiOkResponse({
    description: 'Hotel details',
    type: HotelDetailsResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid stay dates; errors are grouped by field',
    example: {
      message: 'Validation failed',
      errors: { checkOut: ['Check-out must be after the check-in day'] },
    },
  })
  @ApiNotFoundResponse({ description: 'Hotel not found or not active' })
  getDetails(
    @Param('id') id: string,
    @Query() query: HotelDetailsQueryDto,
  ): Promise<HotelDetailsResponseDto> {
    return this.hotelsService.getDetails(id, query);
  }
}
