import { Controller, Param, Patch, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { ValidationErrorResponseDto } from '../auth/dto/validation-error-response.dto';
import { AttachItineraryDto } from './dto/attach-itinerary.dto';
import { ErrorResponseDto } from './dto/error-response.dto';
import { PostItineraryResponseDto } from './dto/post-itinerary-response.dto';
import { PostItineraryService } from './post-itinerary.service';
import { StrictBody } from './strict-body.decorator';

// BLG-13 (optional bonus). ":id/itinerary" has two path segments, so it never matches PATCH /api/posts/:id.
@ApiTags('blog')
@Controller('posts')
export class PostItineraryController {
  constructor(private readonly postItineraryService: PostItineraryService) {}

  @Patch(':id/itinerary')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Attach an itinerary to my post, or remove it (BLG-13, optional)',
    description:
      'Optional bonus. Author only. Attaches one itinerary to the post (draft or published), replacing any ' +
      'itinerary already attached; send null to remove it. The itinerary must exist and belong to the author. ' +
      'Unknown fields are rejected. Only the ids are returned, never the itinerary\'s content.',
  })
  @ApiParam({ name: 'id', description: 'Post id (MongoDB ObjectId)', example: '6650f1c2a1b2c3d4e5f60711' })
  @ApiBody({ type: AttachItineraryDto })
  @ApiResponse({ status: 200, description: 'Itinerary attached or removed', type: PostItineraryResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (itineraryId missing, not a valid id and not null, or unknown fields); errors are grouped by field',
    type: ValidationErrorResponseDto,
    example: { message: 'Validation failed', errors: { itineraryId: ['Itinerary id must be a valid id, or null to remove the itinerary'] } },
  })
  @ApiResponse({ status: 401, description: 'Not logged in', type: ErrorResponseDto })
  @ApiResponse({
    status: 403,
    description: 'The post belongs to another user, or the itinerary belongs to another user',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Invalid post id, the post does not exist, or the itinerary does not exist',
    type: ErrorResponseDto,
  })
  setItinerary(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @StrictBody() dto: AttachItineraryDto,
  ): Promise<PostItineraryResponseDto> {
    return this.postItineraryService.setItinerary(this.requireUserId(req), id, dto?.itineraryId);
  }

  // The user id always comes from the authenticated token, never from the body or query
  private requireUserId(req: AuthenticatedRequest): string {
    const user = req.user as (AuthenticatedRequest['user'] & { userId?: unknown; id?: unknown; _id?: unknown }) | undefined;
    const userId = user?.userId ?? user?.id ?? user?._id ?? user?.sub;
    if (!userId) throw new UnauthorizedException('Not authenticated');
    return String(userId);
  }
}
