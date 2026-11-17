import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Comment, CommentSchema } from '../blog/schemas/comment.schema';
import { Like, LikeSchema } from '../blog/schemas/like.schema';
import { Post, PostSchema } from '../blog/schemas/post.schema';
import { Review, ReviewSchema } from '../hotel-bookings/schemas/review.schema';
import { Activity, ActivitySchema } from '../itineraries/schemas/activity.schema';
import { BudgetEntry, BudgetEntrySchema } from '../itineraries/schemas/budget-entry.schema';
import { ItineraryDay, ItineraryDaySchema } from '../itineraries/schemas/itinerary-day.schema';
import { Itinerary, ItinerarySchema } from '../itineraries/schemas/itinerary.schema';
import { TransportCost, TransportCostSchema } from '../itineraries/schemas/transport-cost.schema';
import { AdminReportsController } from './admin-reports.controller';
import { AdminReportsService } from './admin-reports.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { Report, ReportSchema } from './schemas/report.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Report.name, schema: ReportSchema },
      // GEN-09 reads these to check that the reported item exists and is visible;
      // GEN-10 hides or deletes them (same model names and schemas as their owner modules)
      { name: Post.name, schema: PostSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: Itinerary.name, schema: ItinerarySchema },
      // GEN-10: dependent records deleted with a post (BLG-04) or an itinerary (ITN-01)
      { name: Like.name, schema: LikeSchema },
      { name: ItineraryDay.name, schema: ItineraryDaySchema },
      { name: Activity.name, schema: ActivitySchema },
      { name: BudgetEntry.name, schema: BudgetEntrySchema },
      { name: TransportCost.name, schema: TransportCostSchema },
    ]),
    // Also provides the User model (reporter names) and the JWT guard dependencies
    AuthModule,
  ],
  controllers: [ReportsController, AdminReportsController],
  providers: [ReportsService, AdminReportsService],
})
export class ReportsModule {}
