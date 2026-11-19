import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ValidationErrorResponseDto } from '../auth/dto/validation-error-response.dto';
import { ErrorResponseDto } from '../blog/dto/error-response.dto';
import { PaginationQueryDto } from '../common/pagination/pagination';
import { StrictQuery } from '../reports/strict-query.decorator';
import { HotelDetailsQueryDto } from './dto/hotel-details-query.dto';
import { HotelDetailsResponseDto } from './dto/hotel-details-response.dto';
import { HotelIdParamDto } from './dto/hotel-id-param.dto';
import { HotelReviewsPageDto } from './dto/hotel-reviews-response.dto';
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

  // Two path segments, so GET /hotels/:id never matches this route
  @Get(':id/reviews')
  @ApiOperation({
    summary: 'Hotel average rating, number of ratings and reviews (HTL-24)',
    description:
      'Public: no login needed. Returns the hotel average rating and number of ratings, and its reviews newest ' +
      'first, 10 per page (GEN-05); only "page" is accepted, unknown parameters are rejected. Hidden reviews are ' +
      'not listed. Each review shows the reviewer by display name only; reviews of deactivated or deleted accounts ' +
      'are shown as "Deleted user" (ACC-12). An empty page returns 200 with an empty list.',
  })
  @ApiParam({ name: 'id', description: 'Hotel id', example: '6aef930b9e8df6e7c5a939d1' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, description: 'Page number, starting at 1' })
  @ApiOkResponse({ description: 'Average rating, number of ratings and one page of reviews', type: HotelReviewsPageDto })
  @ApiBadRequestResponse({
    description: 'Invalid hotel id, invalid page or an unknown query parameter',
    type: ValidationErrorResponseDto,
    example: { message: 'Validation failed', errors: { id: ['Hotel id must be a valid id'] } },
  })
  @ApiNotFoundResponse({
    description: 'Hotel not found or not active',
    type: ErrorResponseDto,
    example: { statusCode: 404, message: 'Hotel not found', error: 'Not Found' },
  })
  listReviews(
    @Param() params: HotelIdParamDto,
    @StrictQuery() query: PaginationQueryDto,
  ): Promise<HotelReviewsPageDto> {
    return this.hotelsService.listReviews(params.id, query.page ?? 1);
  }
}
