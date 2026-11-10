import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Comment, CommentSchema } from '../blog/schemas/comment.schema';
import { Like, LikeSchema } from '../blog/schemas/like.schema';
import { Post, PostSchema } from '../blog/schemas/post.schema';
import { Review, ReviewSchema } from '../hotel-bookings/schemas/review.schema';
import { UploadsModule } from '../uploads/uploads.module';
import { AdminReportsController } from './admin-reports.controller';
import { AdminReportsService } from './admin-reports.service';
import { ContentModerationService } from './content-moderation.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { Report, ReportSchema } from './schemas/report.schema';

// GEN-09: reports. GEN-10: admin resolution and moderation of posts and comments.
// Post, Comment, Like and Review are other modules' models (@nestjs/mongoose reuses the already-registered
// model of the same name). Review is only read; posts / comments / likes are changed only by GEN-10 moderation.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Report.name, schema: ReportSchema },
      { name: Post.name, schema: PostSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: Like.name, schema: LikeSchema },
    ]),
    AuthModule,
    UploadsModule, // GEN-10: delete a deleted post's image files
  ],
  controllers: [ReportsController, AdminReportsController],
  providers: [ReportsService, AdminReportsService, ContentModerationService],
  exports: [ReportsService],
})
export class ReportsModule {}
