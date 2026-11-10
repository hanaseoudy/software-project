import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';
import { PostSearchController } from './post-search.controller';
import { PostSearchService } from './post-search.service';
import { Post, PostSchema } from './schemas/post.schema';
import { Comment, CommentSchema } from './schemas/comment.schema';
import { Like, LikeSchema } from './schemas/like.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: Like.name, schema: LikeSchema },
      
    ]),
    AuthModule,
  ],
  // BLG-09: PostSearchController first so /posts/search wins over any /posts/:id route
  controllers: [PostSearchController, BlogController],
  providers: [BlogService, PostSearchService],
})
export class BlogModule {}