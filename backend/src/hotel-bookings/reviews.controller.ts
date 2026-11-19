import { Controller, Delete, Param, Patch, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { DeleteReviewResponseDto, ReviewResponseDto } from './dto/review-response.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewsService } from './reviews.service';

const REVIEW_ID = { name: 'id', description: 'Review id', example: '6650f1c2a1b2c3d4e5f60900' };
const UNAUTHORIZED = { description: 'Not logged in', type: ErrorResponseDto };
const FORBIDDEN = {
  description: 'The review belongs to another user',
  type: ErrorResponseDto,
  example: { statusCode: 403, message: 'You can only change your own reviews', error: 'Forbidden' },
};
const NOT_FOUND = {
  description: 'Review not found (or invalid id)',
  type: ErrorResponseDto,
  example: { statusCode: 404, message: 'Review not found', error: 'Not Found' },
};

// HTL-23: the author edits or deletes their review of a completed reservation
@ApiTags('Hotel Bookings')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Patch(':id')
  @ApiOperation({
    summary: 'HTL-23: edit your review',
    description:
      'Author only. Send rating (whole number 1 to 5) and/or comment (up to 1000 characters, trimmed; null removes ' +
      'it). At least one field is required and only the fields sent are changed. The hotel average rating and ' +
      'number of ratings are recalculated. Unknown body fields are rejected.',
  })
  @ApiParam(REVIEW_ID)
  @ApiOkResponse({ description: 'Review updated', type: ReviewResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid rating or comment, no field to change, or an unknown field',
    type: ValidationErrorResponseDto,
    example: { message: 'Validation failed', errors: { body: ['Send a rating or a comment to change'] } },
  })
  @ApiUnauthorizedResponse(UNAUTHORIZED)
  @ApiForbiddenResponse(FORBIDDEN)
  @ApiNotFoundResponse(NOT_FOUND)
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @StrictBody() dto: UpdateReviewDto,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.update(req.user?.sub, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'HTL-23: delete your review',
    description:
      'Author only. Permanently deletes the review; the reservation can then be reviewed again. The hotel average ' +
      'rating and number of ratings are recalculated and returned.',
  })
  @ApiParam(REVIEW_ID)
  @ApiOkResponse({ description: 'Review deleted', type: DeleteReviewResponseDto })
  @ApiUnauthorizedResponse(UNAUTHORIZED)
  @ApiForbiddenResponse(FORBIDDEN)
  @ApiNotFoundResponse(NOT_FOUND)
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string): Promise<DeleteReviewResponseDto> {
    return this.reviewsService.remove(req.user?.sub, id);
  }
}
