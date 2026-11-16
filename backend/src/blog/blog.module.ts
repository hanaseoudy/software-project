import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BlogController } from './blog.controller';
import { CommentsController } from './comments.controller';
import { BlogService } from './blog.service';
import { TagsController } from './tags.controller';
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
  controllers: [BlogController, TagsController, CommentsController],
  providers: [BlogService],
})
export class BlogModule {}