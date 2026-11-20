import { Body, Controller, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { ReplyToReviewDto, ReviewWithReplyDto } from './dto/review-reply.dto';
import { ReviewRepliesService } from './review-replies.service';

@ApiTags('Hotel Bookings')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reviews')
export class ReviewRepliesController {
  constructor(private readonly replies: ReviewRepliesService) {}

  @Post(':id/reply')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.MODERATOR)
  @ApiOperation({
    summary: 'HTL-26 (bonus): reply to a review of my hotel',
    description:
      'Hotel moderator only, and only for a review of the hotel they are assigned to. A review can have one reply; a hidden review cannot be replied to.',
  })
  @ApiCreatedResponse({ type: ReviewWithReplyDto })
  @ApiBadRequestResponse({
    description: 'Validation failed; errors are grouped by field',
  })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({
    description: 'Not a moderator, or not assigned to the hotel of this review',
  })
  @ApiNotFoundResponse({ description: 'Review not found' })
  @ApiConflictResponse({ description: 'The review already has a reply' })
  reply(
    @Param('id') id: string,
    @Body() dto: ReplyToReviewDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ReviewWithReplyDto> {
    return this.replies.reply(id, dto, req.user!);
  }
}
