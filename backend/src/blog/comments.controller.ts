import { Controller, Delete, HttpCode, Param, Patch, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBody, ApiCookieAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { ValidationErrorResponseDto } from '../auth/dto/validation-error-response.dto';
import { BlogService } from './blog.service';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentResponseDto } from './dto/comment-response.dto';
import { StrictBody } from './strict-body.decorator';

@ApiTags('blog')
@Controller('comments')
@UseGuards(JwtAuthGuard)
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in' })
@ApiForbiddenResponse({ description: 'The comment belongs to another user' })
@ApiNotFoundResponse({ description: 'Invalid comment id or comment not found' })
export class CommentsController {
  constructor(private readonly blogService: BlogService) {}

  @Patch(':id')
  @ApiOperation({ summary: 'Edit my comment (BLG-07)' })
  @ApiParam({ name: 'id', description: 'Comment id (MongoDB ObjectId)' })
  @ApiBody({ type: UpdateCommentDto })
  @ApiOkResponse({ description: 'Comment updated; original creation date preserved', type: CommentResponseDto })
  @ApiBadRequestResponse({ description: 'Text must be non-empty and at most 500 characters; unknown fields are rejected', type: ValidationErrorResponseDto })
  update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @StrictBody() dto: UpdateCommentDto): Promise<CommentResponseDto> {
    return this.blogService.updateComment(this.userId(req), id, dto.text);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete my comment (BLG-07)' })
  @ApiParam({ name: 'id', description: 'Comment id (MongoDB ObjectId)' })
  @ApiResponse({ status: 204, description: 'Comment deleted' })
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string): Promise<void> {
    await this.blogService.deleteComment(this.userId(req), id);
  }

  private userId(req: AuthenticatedRequest): string {
    if (!req.user?.sub) throw new UnauthorizedException('Not authenticated');
    return req.user.sub;
  }
}
