import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Comment, CommentSchema } from '../blog/schemas/comment.schema';
import { Post, PostSchema } from '../blog/schemas/post.schema';
import { Review, ReviewSchema } from '../hotel-bookings/schemas/review.schema';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { Report, ReportSchema } from './schemas/report.schema';

// GEN-09: reports. Post, Comment and Review are other modules' models, registered here only to read them
// (@nestjs/mongoose reuses the already-registered model of the same name).
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Report.name, schema: ReportSchema },
      { name: Post.name, schema: PostSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: Review.name, schema: ReviewSchema },
    ]),
    AuthModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
