import { Body, Controller, Delete, Param, Patch, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'Edit my own comment (BLG-07)' })
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.blogService.updateComment(this.userId(req), id, dto);
  }

  // TODO: add the auth guard here (ACC-04)
  @Delete(':id')
  @ApiOperation({ summary: 'Delete my own comment (BLG-07)' })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.blogService.deleteComment(this.userId(req), id);
  }
}