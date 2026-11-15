import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Error as MongooseError, isValidObjectId, Model, Types } from 'mongoose';
import { Comment, CommentDocument } from '../blog/schemas/comment.schema';
import { Post, PostDocument, PostStatus } from '../blog/schemas/post.schema';
import { Review, ReviewDocument } from '../hotel-bookings/schemas/review.schema';
import { Itinerary, ItineraryDocument, ItineraryVisibility } from '../itineraries/schemas/itinerary.schema';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportResponseDto } from './dto/report-response.dto';
import { REPORT_REASON_MAX_LENGTH, ReportContentType, ReportStatus } from './enums/report.enums';
import { Report, ReportDocument } from './schemas/report.schema';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

const DUPLICATE_KEY = 11000;

// Only published, non-hidden posts are public (same rule as the blog module)
const VISIBLE_POST = { status: PostStatus.PUBLISHED, isHidden: { $ne: true } };

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Report.name) private readonly reportModel: Model<ReportDocument>,
    @InjectModel(Post.name) private readonly postModel: Model<PostDocument>,
    @InjectModel(Comment.name) private readonly commentModel: Model<CommentDocument>,
    @InjectModel(Review.name) private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(Itinerary.name) private readonly itineraryModel: Model<ItineraryDocument>,
  ) {}

  // GEN-09: a registered user reports an item they can see, with a reason, at most once per item.
  // The reporter always comes from the logged-in user, never from the request body.
  async create(userId: string, dto: CreateReportDto): Promise<ReportResponseDto> {
    if (!userId || !isValidObjectId(userId)) {
      throw new UnauthorizedException('Not authenticated');
    }
    // Re-check the input at the service boundary; never assume the DTO ran or the types are right
    const contentType = this.toContentType(dto.contentType);
    const contentId = this.toContentId(dto.contentId);
    const reason = this.toReason(dto.reason);

    await this.assertVisible(contentType, contentId);

    // The unique (reporter, contentType, contentId) index is the real guard, so concurrent
    // requests cannot create two reports of the same item
    const report = await this.runDb('Could not create the report', async () => {
      try {
        return await this.reportModel.create({
          reporter: new Types.ObjectId(userId),
          contentType,
          contentId,
          reason,
          status: ReportStatus.OPEN,
        });
      } catch (error) {
        if ((error as { code?: number })?.code === DUPLICATE_KEY) {
          throw new ConflictException('You have already reported this item');
        }
        throw error;
      }
    });

    return {
      id: report._id.toString(),
      contentType: report.contentType,
      contentId: report.contentId.toString(),
      reason: report.reason,
      status: report.status,
      createdAt: report.get('createdAt') as Date,
    };
  }

  // 404 when the item does not exist or is not publicly visible
  private async assertVisible(contentType: ReportContentType, contentId: Types.ObjectId): Promise<void> {
    let found: unknown;
    switch (contentType) {
      case ReportContentType.POST:
        found = await this.runDb('Could not load the content', () =>
          this.postModel.exists({ _id: contentId, ...VISIBLE_POST }).exec(),
        );
        break;
      case ReportContentType.COMMENT: {
        // A comment is visible when it is not hidden and its post is visible
        const comment = await this.runDb('Could not load the content', () =>
          this.commentModel
            .findOne({ _id: contentId, isHidden: { $ne: true } })
            .select('post')
            .lean<{ post: Types.ObjectId }>()
            .exec(),
        );
        found =
          comment &&
          (await this.runDb('Could not load the content', () =>
            this.postModel.exists({ _id: comment.post, ...VISIBLE_POST }).exec(),
          ));
        break;
      }
      case ReportContentType.REVIEW:
        found = await this.runDb('Could not load the content', () =>
          this.reviewModel.exists({ _id: contentId, hidden: { $ne: true } }).exec(),
        );
        break;
      case ReportContentType.ITINERARY:
        found = await this.runDb('Could not load the content', () =>
          this.itineraryModel.exists({ _id: contentId, visibility: ItineraryVisibility.PUBLIC }).exec(),
        );
        break;
    }
    if (!found) {
      throw new NotFoundException('Content not found');
    }
  }

  private toContentType(value: unknown): ReportContentType {
    if (typeof value !== 'string' || !(Object.values(ReportContentType) as string[]).includes(value)) {
      throw this.fieldError('contentType', 'Content type must be post, comment, review or itinerary');
    }
    return value as ReportContentType;
  }

  private toContentId(value: unknown): Types.ObjectId {
    // Strict check: Mongoose's isValidObjectId also accepts any 12-character string
    if (typeof value !== 'string' || !OBJECT_ID_PATTERN.test(value)) {
      throw this.fieldError('contentId', 'Content id must be a valid id');
    }
    return new Types.ObjectId(value);
  }

  private toReason(value: unknown): string {
    if (typeof value !== 'string') {
      throw this.fieldError('reason', 'Reason must be text');
    }
    const reason = value.trim();
    if (reason.length === 0) {
      throw this.fieldError('reason', 'Reason is required');
    }
    if (reason.length > REPORT_REASON_MAX_LENGTH) {
      throw this.fieldError('reason', `Reason must be at most ${REPORT_REASON_MAX_LENGTH} characters`);
    }
    return reason;
  }

  // Same field-level shape as the global validation errors (GEN-02)
  private fieldError(field: string, message: string): BadRequestException {
    return new BadRequestException({ message: 'Validation failed', errors: { [field]: [message] } });
  }

  // Map Mongoose validation errors to 400 (GEN-02 shape) and other database failures to a clean 500
  private async runDb<T>(message: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof MongooseError.ValidationError) {
        const errors: Record<string, string[]> = {};
        for (const [field, fieldError] of Object.entries(error.errors)) {
          (errors[field] ??= []).push(fieldError.message);
        }
        throw new BadRequestException({ message: 'Validation failed', errors });
      }
      if (error instanceof MongooseError.CastError) {
        throw new BadRequestException({ message: 'Validation failed', errors: { [error.path]: ['Invalid value'] } });
      }
      throw new InternalServerErrorException(message);
    }
  }
}
