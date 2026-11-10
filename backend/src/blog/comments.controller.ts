import { Body, Controller, Delete, Param, Patch, Req } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { BlogService } from './blog.service';
import { UpdateCommentDto } from './dto/update-comment.dto';

@ApiTags('Blog')
@Controller('comments')
export class CommentsController {
  constructor(private readonly blogService: BlogService) {}

  private userId(req: any): string {
    return req.user?.userId ?? req.user?.id ?? req.user?.sub;
  }

  // TODO: add the auth guard here (ACC-04)
  @Patch(':id')
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Edit my own comment (BLG-07)',
    description:
      'Comment author only. Same rules as a new comment: required, trimmed, max 500 characters.',
  })
  @ApiParam({ name: 'id', description: 'Comment id' })
  @ApiResponse({ status: 200, description: 'Updated comment' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Login required' })
  @ApiResponse({ status: 403, description: 'Not your comment' })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.blogService.updateComment(this.userId(req), id, dto);
  }

  // TODO: add the auth guard here (ACC-04)
  @Delete(':id')
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Delete my own comment (BLG-07)',
    description:
      'Comment author only. Decreases commentsCount on the post.',
  })
  @ApiParam({ name: 'id', description: 'Comment id' })
  @ApiResponse({ status: 200, description: 'Comment deleted' })
  @ApiResponse({ status: 401, description: 'Login required' })
  @ApiResponse({ status: 403, description: 'Not your comment' })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.blogService.deleteComment(this.userId(req), id);
  }
}