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
import { Itinerary, ItinerarySchema } from '../itineraries/schemas/itinerary.schema';
import { PostItineraryController } from './post-itinerary.controller';
import { PostItineraryService } from './post-itinerary.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Post.name, schema: PostSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: Like.name, schema: LikeSchema },
      // BLG-13: read-only access to the itinerary module's model (same name and schema, no second schema)
      { name: Itinerary.name, schema: ItinerarySchema },
    ]),
    AuthModule,
  ],
  controllers: [BlogController, TagsController, CommentsController, PostItineraryController],
  providers: [BlogService, PostItineraryService],
})
export class BlogModule {}