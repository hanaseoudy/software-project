import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BlogService } from './blog.service';
import { CreatePostDto } from './dto/create-post.dto';

@ApiTags('Blog')
@Controller('posts')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  // TODO: add the auth guard from the accounts module here (ACC-04)
  @Post()
  @ApiOperation({ summary: 'Create a post as draft or published (BLG-01)' })
  create(@Req() req: any, @Body() dto: CreatePostDto) {
    const userId = req.user?.userId ?? req.user?.id ?? req.user?.sub;
    return this.blogService.createPost(userId, dto);
  }
}