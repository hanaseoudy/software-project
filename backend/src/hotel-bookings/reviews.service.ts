import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Error as MongooseError, Model, Types } from 'mongoose';
import { Hotel } from '../hotels/schemas/hotel.schema';
import { CreateReviewDto, REVIEW_COMMENT_MAX_LENGTH } from './dto/create-review.dto';
import { DeleteReviewResponseDto, ReviewResponseDto } from './dto/review-response.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { HotelBooking, HotelBookingStatus } from './schemas/hotel-booking.schema';
import { Review } from './schemas/review.schema';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const DUPLICATE_KEY = 11000;

type ReviewRow = Review & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
type HotelRating = { averageRating: number; reviewCount: number };

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    @InjectModel(Review.name) private readonly reviewModel: Model<Review>,
    @InjectModel(HotelBooking.name) private readonly bookingModel: Model<HotelBooking>,
    @InjectModel(Hotel.name) private readonly hotelModel: Model<Hotel>,
  ) {}

  // HTL-23: one rating (1-5) and an optional review per Completed reservation, regardless of the number of rooms.
  // The unique index on "booking" makes a second review for the same reservation fail even under concurrency.
  async create(userId: unknown, bookingId: unknown, dto: CreateReviewDto): Promise<ReviewResponseDto> {
    const user = this.requireUserId(userId);
    const id = this.toObjectId(bookingId);
    if (!id) throw new NotFoundException('Reservation not found');
    const rating = this.toRating(dto?.rating, true) as number;
    const comment = this.toComment(dto?.comment, false);

    const booking = await this.runDb('Could not load the reservation', () =>
      this.bookingModel
        .findById(id)
        .select('user hotel status checkOut')
        .lean<{ _id: Types.ObjectId; user: Types.ObjectId; hotel: Types.ObjectId; status: string; checkOut: Date }>()
        .exec(),
    );
    if (!booking) throw new NotFoundException('Reservation not found');
    if (!booking.user.equals(user)) throw new ForbiddenException('You can only review your own reservations');
    if (!this.isCompleted(booking.status, booking.checkOut)) {
      throw new ConflictException('You can review a reservation only after it is completed');
    }

    const created = await this.runDb('Could not save the review', () =>
      this.reviewModel.create({
        user,
        hotel: booking.hotel,
        booking: booking._id,
        rating,
        ...(comment ? { comment } : {}),
      }),
    );
    await this.recomputeHotelRating(booking.hotel);
    return this.toResponse(created.toObject<ReviewRow>());
  }

  // HTL-23: the author changes the rating and/or the review text; reservation, hotel and author never change
  async update(userId: unknown, reviewId: unknown, dto: UpdateReviewDto): Promise<ReviewResponseDto> {
    const user = this.requireUserId(userId);
    const rating = this.toRating(dto?.rating, false);
    const comment = this.toComment(dto?.comment, true);
    if (rating === undefined && comment === undefined) {
      throw this.invalid('body', 'Send a rating or a comment to change');
    }
    const review = await this.findOwnReview(user, reviewId);

    const update: { $set?: Record<string, unknown>; $unset?: Record<string, 1> } = {};
    const set: Record<string, unknown> = {};
    if (rating !== undefined) set.rating = rating;
    if (typeof comment === 'string') set.comment = comment;
    if (Object.keys(set).length > 0) update.$set = set;
    if (comment === null) update.$unset = { comment: 1 };

    // The author is part of the filter, so ownership is enforced by the database update itself
    const updated = await this.runDb('Could not update the review', () =>
      this.reviewModel
        .findOneAndUpdate({ _id: review._id, user }, update, { returnDocument: 'after', runValidators: true })
        .lean<ReviewRow>()
        .exec(),
    );
    if (!updated) throw new NotFoundException('Review not found');
    await this.recomputeHotelRating(updated.hotel);
    return this.toResponse(updated);
  }

  // HTL-23: the author deletes the review (hard delete); the reservation can be reviewed again afterwards
  async remove(userId: unknown, reviewId: unknown): Promise<DeleteReviewResponseDto> {
    const user = this.requireUserId(userId);
    const review = await this.findOwnReview(user, reviewId);
    const result = await this.runDb('Could not delete the review', () =>
      this.reviewModel.deleteOne({ _id: review._id, user }).exec(),
    );
    if (result.deletedCount === 0) throw new NotFoundException('Review not found');
    const rating = await this.recomputeHotelRating(review.hotel);
    return {
      message: 'Review deleted',
      hotelAverageRating: rating?.averageRating ?? null,
      hotelRatingsCount: rating?.reviewCount ?? null,
    };
  }

  // Shared by edit and delete: 404 for an invalid or unknown id, 403 when the caller is not the author
  private async findOwnReview(user: Types.ObjectId, reviewId: unknown) {
    const id = this.toObjectId(reviewId);
    if (!id) throw new NotFoundException('Review not found');
    const review = await this.runDb('Could not load the review', () =>
      this.reviewModel
        .findById(id)
        .select('user hotel')
        .lean<{ _id: Types.ObjectId; user: Types.ObjectId; hotel: Types.ObjectId }>()
        .exec(),
    );
    if (!review) throw new NotFoundException('Review not found');
    if (!review.user.equals(user)) throw new ForbiddenException('You can only change your own reviews');
    return review;
  }

  // HTL-23 / GEN-11: Completed, or Confirmed with the check-out date already passed (the hourly job may not have run yet).
  // Dates are stored and compared as UTC instants, the same rule as HotelCompletionService.
  private isCompleted(status: string, checkOut: Date, now = new Date()): boolean {
    if (status === HotelBookingStatus.COMPLETED) return true;
    return (
      status === HotelBookingStatus.CONFIRMED &&
      checkOut instanceof Date &&
      !Number.isNaN(checkOut.getTime()) &&
      checkOut.getTime() <= now.getTime()
    );
  }

  // HTL-23: the hotel's average rating and number of ratings, always recalculated from its visible reviews
  // (hidden ones excluded, GEN-10) so the value cannot drift. Only averageRating and reviewCount are written.
  // The review change is already saved, so a failure here is logged and does not fail the request.
  private async recomputeHotelRating(hotelId: Types.ObjectId): Promise<HotelRating | null> {
    try {
      const [stats] = await this.reviewModel
        .aggregate<{ count: number; average: number }>([
          { $match: { hotel: hotelId, hidden: { $ne: true } } },
          { $group: { _id: null, count: { $sum: 1 }, average: { $avg: '$rating' } } },
        ])
        .exec();
      const reviewCount = stats?.count ?? 0;
      const averageRating = reviewCount > 0 ? Math.round(stats.average * 100) / 100 : 0;
      await this.hotelModel.updateOne({ _id: hotelId }, { $set: { averageRating, reviewCount } }).exec();
      return { averageRating, reviewCount };
    } catch (error) {
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown error';
      this.logger.error(`Could not recalculate the rating of hotel ${hotelId.toString()}: ${reason}`);
      return null;
    }
  }

  private requireUserId(userId: unknown): Types.ObjectId {
    const id = this.toObjectId(userId);
    if (!id) throw new UnauthorizedException('Not authenticated');
    return id;
  }

  private toObjectId(value: unknown): Types.ObjectId | null {
    return typeof value === 'string' && OBJECT_ID_PATTERN.test(value) ? new Types.ObjectId(value) : null;
  }

  // Service-level check of the DTO rules (never trusts the type of the input)
  private toRating(value: unknown, required: boolean): number | undefined {
    if (value === undefined && !required) return undefined;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) {
      throw this.invalid('rating', 'Rating must be a whole number from 1 to 5');
    }
    return value;
  }

  // Returns the trimmed text, undefined when not sent, or null (edit only) to remove the comment
  private toComment(value: unknown, allowNull: boolean): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null && allowNull) return null;
    if (typeof value !== 'string') throw this.invalid('comment', 'Comment must be text');
    const text = value.trim();
    if (!text) {
      if (allowNull) throw this.invalid('comment', 'Comment cannot be empty; send null to remove it');
      return undefined;
    }
    if (text.length > REVIEW_COMMENT_MAX_LENGTH) {
      throw this.invalid('comment', `Comment must be at most ${REVIEW_COMMENT_MAX_LENGTH} characters`);
    }
    return text;
  }

  private toResponse(review: ReviewRow): ReviewResponseDto {
    return {
      id: review._id.toString(),
      reservationId: review.booking.toString(),
      hotelId: review.hotel.toString(),
      rating: review.rating,
      comment: review.comment ?? null,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }

  // GEN-02: same field-level shape as the global ValidationPipe
  private invalid(field: string, message: string) {
    return new BadRequestException({ message: 'Validation failed', errors: { [field]: [message] } });
  }

  // Expected database errors become Nest exceptions; anything else is a 500 with a safe message
  private async runDb<T>(message: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if ((error as { code?: unknown })?.code === DUPLICATE_KEY) {
        throw new ConflictException('This reservation already has a review');
      }
      if (error instanceof MongooseError.ValidationError) {
        const errors: Record<string, string[]> = {};
        for (const [field, fieldError] of Object.entries(error.errors)) {
          (errors[field] ??= []).push(fieldError.message);
        }
        throw new BadRequestException({ message: 'Validation failed', errors });
      }
      if (error instanceof MongooseError.CastError) throw this.invalid(error.path, 'Invalid value');
      throw new InternalServerErrorException(message);
    }
  }
}
