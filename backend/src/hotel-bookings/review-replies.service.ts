import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import type { AuthPayload } from '../common/guards/jwt-auth.guard';
import {
  ModeratorAssignment,
  ProviderType,
} from '../users/schemas/moderatorassignment.schema';
import { ReplyToReviewDto, ReviewWithReplyDto } from './dto/review-reply.dto';
import { Review } from './schemas/review.schema';

type ReviewRow = Pick<Review, 'hotel' | 'rating' | 'comment'> & {
  _id: Types.ObjectId;
};

/**
 * HTL-26 (optional bonus): the hotel moderator replies to a review of their own hotel.
 * One reply per review. A hidden review (GEN-09) cannot be replied to. The reply is stored on the
 * review (Review.reply) so the review list (HTL-24) can show it next to the review.
 */
@Injectable()
export class ReviewRepliesService {
  constructor(
    @InjectModel(Review.name) private readonly reviewModel: Model<Review>,
    @InjectModel(ModeratorAssignment.name)
    private readonly assignmentModel: Model<ModeratorAssignment>,
  ) {}

  async reply(
    reviewId: string,
    dto: ReplyToReviewDto,
    user: AuthPayload,
    now: Date = new Date(),
  ): Promise<ReviewWithReplyDto> {
    const notFound = new NotFoundException('Review not found');
    if (!isValidObjectId(reviewId)) throw notFound;
    const review = await this.reviewModel
      .findOne({ _id: new Types.ObjectId(reviewId), hidden: { $ne: true } })
      .select('hotel rating comment')
      .lean<ReviewRow>()
      .exec();
    if (!review) throw notFound;

    const assigned = isValidObjectId(user.sub)
      ? await this.assignmentModel
          .exists({
            moderatorId: new Types.ObjectId(user.sub),
            providerType: ProviderType.HOTEL,
            providerId: review.hotel,
          })
          .exec()
      : null;
    if (!assigned) {
      throw new ForbiddenException(
        'You can only reply to reviews of your assigned hotel',
      );
    }

    // One atomic step: only the first reply is saved, even if two arrive at the same moment.
    const reply = {
      text: dto.text,
      moderator: new Types.ObjectId(user.sub),
      repliedAt: now,
    };
    const saved = await this.reviewModel
      .updateOne(
        { _id: review._id, hidden: { $ne: true }, reply: { $exists: false } },
        { $set: { reply } },
      )
      .exec();
    if (saved.modifiedCount === 0) {
      throw new ConflictException('This review already has a reply');
    }

    return {
      id: String(review._id),
      hotel: String(review.hotel),
      rating: review.rating,
      comment: review.comment ?? null,
      reply: {
        text: reply.text,
        moderator: user.sub,
        repliedAt: now.toISOString(),
      },
    };
  }
}
