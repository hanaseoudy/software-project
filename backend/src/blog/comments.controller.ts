
import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ACCESS_COOKIE } from '../auth/auth.cookies';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { BlogService } from './blog.service';
import { UpdateCommentDto } from './dto/update-comment.dto';

@ApiTags('Blog')
@Controller('comments')
export class CommentsController {
  constructor(private readonly blogService: BlogService) {}

  private userId(req: any): string {
    const user = req.user;
    return String(
      user?.userId ?? user?.id ?? user?._id ?? user?.sub ?? '',
    );
  }

  // ACC-04: Authentication required to edit a comment.
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @ApiOperation({ summary: 'Edit my own comment (BLG-07)' })
  @ApiCookieAuth(ACCESS_COOKIE)
  @ApiParam({ name: 'id', description: 'Comment id', example: '665f1c2e9b1e8a0012a3b4d6' })
  @ApiResponse({ status: 401, description: 'Login required' })
  @ApiResponse({ status: 403, description: 'You can only change your own comments' })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  @ApiResponse({ status: 200, description: 'Comment updated' })
  @ApiResponse({ status: 400, description: 'Text is empty or longer than 500 characters' })
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.blogService.updateComment(this.userId(req), id, dto);
  }

  // ACC-04: Authentication required to delete a comment.
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete my own comment (BLG-07)' })
  @ApiCookieAuth(ACCESS_COOKIE)
  @ApiParam({ name: 'id', description: 'Comment id', example: '665f1c2e9b1e8a0012a3b4d6' })
  @ApiResponse({ status: 401, description: 'Login required' })
  @ApiResponse({ status: 403, description: 'You can only change your own comments' })
  @ApiResponse({ status: 404, description: 'Comment not found' })
  @ApiResponse({ status: 200, description: 'Comment deleted' })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.blogService.deleteComment(this.userId(req), id);
  }
}
