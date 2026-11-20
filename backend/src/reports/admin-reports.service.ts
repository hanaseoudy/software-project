import { ItineraryBookingLink } from '../itineraries/schemas/itinerary-booking-link.schema';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Error as MongooseError, isValidObjectId, Model, Types } from 'mongoose';
import { Comment, CommentDocument } from '../blog/schemas/comment.schema';
import { Like, LikeDocument } from '../blog/schemas/like.schema';
import { Post, PostDocument } from '../blog/schemas/post.schema';
import { Review, ReviewDocument } from '../hotel-bookings/schemas/review.schema';
import { Activity, ActivityDocument } from '../itineraries/schemas/activity.schema';
import { BudgetEntry, BudgetEntryDocument } from '../itineraries/schemas/budget-entry.schema';
import { ItineraryDay, ItineraryDayDocument } from '../itineraries/schemas/itinerary-day.schema';
import { Itinerary, ItineraryDocument } from '../itineraries/schemas/itinerary.schema';
import { TransportCost, TransportCostDocument } from '../itineraries/schemas/transport-cost.schema';
import { PAGE_SIZE, paginate, skipFor } from '../common/pagination/pagination';
import { User, UserDocument } from '../users/schemas/user.schema';
import { AuditEntryInput, AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction, AuditTargetType } from '../audit-logs/enums/audit-log.enums';
import { ContentParamsDto, ListReportsQueryDto, ResolveReportDto } from './dto/admin-report-request.dto';
import {
  AdminReportItemDto,
  AdminReportsPageDto,
  ModerationResultDto,
  ResolveReportResponseDto,
} from './dto/admin-report-response.dto';
import { ModerationAction, REPORT_PREVIEW_LENGTH, ResolveAction } from './enums/moderation.enums';
import { ReportContentType, ReportStatus } from './enums/report.enums';
import { Report, ReportDocument } from './schemas/report.schema';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

const DELETED_USER = 'Deleted user';

type ReportRow = {
  _id: Types.ObjectId;
  reporter: Types.ObjectId;
  contentType: ReportContentType;
  contentId: Types.ObjectId;
  reason: string;
  status: ReportStatus;
  createdAt: Date;
};

// Comments removed together with a deleted post; their open reports are closed as well
type CascadedComments = Types.ObjectId[];

@Injectable()
export class AdminReportsService {
  private readonly logger = new Logger(AdminReportsService.name);

  constructor(
    @InjectModel(Report.name) private readonly reportModel: Model<ReportDocument>,
    @InjectModel(Post.name) private readonly postModel: Model<PostDocument>,
    @InjectModel(Comment.name) private readonly commentModel: Model<CommentDocument>,
    @InjectModel(Like.name) private readonly likeModel: Model<LikeDocument>,
    @InjectModel(Review.name) private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(Itinerary.name) private readonly itineraryModel: Model<ItineraryDocument>,
    @InjectModel(ItineraryDay.name) private readonly itineraryDayModel: Model<ItineraryDayDocument>,
    @InjectModel(Activity.name) private readonly activityModel: Model<ActivityDocument>,
    @InjectModel(BudgetEntry.name) private readonly budgetEntryModel: Model<BudgetEntryDocument>,
    @InjectModel(TransportCost.name) private readonly transportCostModel: Model<TransportCostDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly auditLogs: AuditLogsService,
    @InjectModel(ItineraryBookingLink.name) private readonly bookingLinks: Model<ItineraryBookingLink>,
  ) {}

  // GEN-10: the moderation queue. Open reports by default, oldest first, page size 10 (GEN-05).
  // Reporters and content previews are loaded with one query per content type plus one for users (no N+1).
  async list(adminId: string, query: ListReportsQueryDto): Promise<AdminReportsPageDto> {
    this.requireAdminId(adminId);
    const status = this.toStatus(query?.status ?? ReportStatus.OPEN);
    const page = this.toPage(query?.page ?? 1);
    const filter = { status };
    const [reports, total] = await this.runDb('Could not load the reports', () =>
      Promise.all([
        this.reportModel
          .find(filter)
          .select('reporter contentType contentId reason status createdAt')
          .sort({ createdAt: 1, _id: 1 })
          .skip(skipFor(page))
          .limit(PAGE_SIZE)
          .lean<ReportRow[]>()
          .exec(),
        this.reportModel.countDocuments(filter).exec(),
      ]),
    );
    const [previews, reporters] = await Promise.all([this.loadPreviews(reports), this.loadReporterNames(reports)]);
    const items: AdminReportItemDto[] = reports.map((report) => ({
      id: report._id.toString(),
      contentType: report.contentType,
      contentId: report.contentId.toString(),
      reason: report.reason,
      status: report.status,
      createdAt: report.createdAt,
      reporter: {
        id: report.reporter.toString(),
        name: reporters.get(report.reporter.toString()) ?? DELETED_USER,
      },
      contentPreview: previews.get(this.contentKey(report.contentType, report.contentId)) ?? null,
    }));
    return paginate(items, total, page);
  }

  // GEN-10: resolve an open report once. The status change only matches a report that is still open,
  // so two admins cannot resolve the same report twice (the second one gets 409).
  async resolve(adminId: string, reportId: string, dto: ResolveReportDto): Promise<ResolveReportResponseDto> {
    this.requireAdminId(adminId);
    const id = this.toObjectId(reportId, 'id', 'Report id must be a valid id');
    const action = this.toResolveAction(dto?.action);

    const report = await this.runDb('Could not load the report', () =>
      this.reportModel
        .findById(id)
        .select('contentType contentId status')
        .lean<Pick<ReportRow, '_id' | 'contentType' | 'contentId' | 'status'>>()
        .exec(),
    );
    if (!report) throw new NotFoundException('Report not found');
    if (report.status !== ReportStatus.OPEN) throw this.alreadyClosed();

    const result = {
      id: report._id.toString(),
      action,
      contentType: report.contentType,
      contentId: report.contentId.toString(),
    };

    if (action === ResolveAction.DISMISS) {
      // The content is left unchanged; dismissing works even if the content was already deleted
      const dismissed = await this.runDb('Could not dismiss the report', () =>
        this.reportModel
          .findOneAndUpdate({ _id: id, status: ReportStatus.OPEN }, { $set: { status: ReportStatus.DISMISSED } })
          .exec(),
      );
      if (!dismissed) throw this.alreadyClosed();
      this.audit({
        actorId: adminId,
        action: AuditAction.REPORT_DISMISSED,
        targetType: AuditTargetType.REPORT,
        targetId: report._id,
        reportId: report._id,
        details: { contentType: report.contentType, contentId: result.contentId },
      });
      return { ...result, status: ReportStatus.DISMISSED, otherReportsResolved: 0 };
    }

    const moderation = action === ResolveAction.HIDE ? ModerationAction.HIDE : ModerationAction.DELETE;
    // One transaction: if the content is missing (404) or anything fails, the report stays open
    const otherReportsResolved = await this.runDb('Could not resolve the report', () =>
      this.reportModel.db.transaction(async (session) => {
        const claimed = await this.reportModel
          .findOneAndUpdate(
            { _id: id, status: ReportStatus.OPEN },
            { $set: { status: ReportStatus.RESOLVED } },
            { session },
          )
          .exec();
        if (!claimed) throw this.alreadyClosed();
        const cascaded = await this.applyModeration(moderation, report.contentType, report.contentId, session);
        return this.resolveOpenReports(report.contentType, report.contentId, cascaded, session);
      }),
    );
    // GEN-07: one entry for the resolution; the other open reports closed with it are counted, not logged one by one
    this.audit({
      actorId: adminId,
      action: moderation === ModerationAction.HIDE ? AuditAction.CONTENT_HIDDEN : AuditAction.CONTENT_DELETED,
      targetType: report.contentType,
      targetId: report.contentId,
      reportId: report._id,
      details: { otherReportsResolved },
    });
    return { ...result, status: ReportStatus.RESOLVED, otherReportsResolved };
  }

  // GEN-10: the admin hides or deletes any post, comment, review or itinerary directly.
  // Open reports about the item are marked resolved in the same transaction.
  async moderate(adminId: string, params: ContentParamsDto, action: ModerationAction): Promise<ModerationResultDto> {
    this.requireAdminId(adminId);
    const contentType = this.toContentType(params?.type);
    const contentId = this.toObjectId(params?.id, 'id', 'Content id must be a valid id');
    const reportsResolved = await this.runDb(
      action === ModerationAction.HIDE ? 'Could not hide the content' : 'Could not delete the content',
      () =>
        this.reportModel.db.transaction(async (session) => {
          const cascaded = await this.applyModeration(action, contentType, contentId, session);
          return this.resolveOpenReports(contentType, contentId, cascaded, session);
        }),
    );
    this.audit({
      actorId: adminId,
      action: action === ModerationAction.HIDE ? AuditAction.CONTENT_HIDDEN : AuditAction.CONTENT_DELETED,
      targetType: contentType,
      targetId: contentId,
      details: { reportsResolved },
    });
    return { action, contentType, contentId: contentId.toString(), reportsResolved };
  }

  // GEN-07: the change is already saved; the audit write runs in the background and never fails the action
  private audit(entry: AuditEntryInput): void {
    try {
      void this.auditLogs.record(entry);
    } catch (err) {
      this.logger.warn(`Could not record audit entry ${entry.action}: ${String(err)}`);
    }
  }

  // Shared by report resolution and the direct admin actions
  private applyModeration(
    action: ModerationAction,
    type: ReportContentType,
    id: Types.ObjectId,
    session: ClientSession,
  ): Promise<CascadedComments> {
    return action === ModerationAction.HIDE
      ? this.hideContent(type, id, session).then(() => [])
      : this.deleteContent(type, id, session);
  }

  // "Hidden content is visible only to its author and admins": only the hidden flag is changed
  private async hideContent(type: ReportContentType, id: Types.ObjectId, session: ClientSession): Promise<void> {
    let matched = 0;
    switch (type) {
      case ReportContentType.POST:
        ({ matchedCount: matched } = await this.postModel
          .updateOne({ _id: id }, { $set: { isHidden: true } }, { session })
          .exec());
        break;
      case ReportContentType.COMMENT:
        ({ matchedCount: matched } = await this.commentModel
          .updateOne({ _id: id }, { $set: { isHidden: true } }, { session })
          .exec());
        break;
      case ReportContentType.REVIEW:
        // The review schema names its flag "hidden" (the same flag GEN-09 checks)
        ({ matchedCount: matched } = await this.reviewModel
          .updateOne({ _id: id }, { $set: { hidden: true } }, { session })
          .exec());
        break;
      case ReportContentType.ITINERARY:
        ({ matchedCount: matched } = await this.itineraryModel
          .updateOne({ _id: id }, { $set: { isHidden: true } }, { session })
          .exec());
        break;
    }
    if (matched !== 1) throw new NotFoundException('Content not found');
  }

  // Deletes the item and its dependent records, with the same cascades as BLG-04, BLG-07 and ITN-01
  private async deleteContent(
    type: ReportContentType,
    id: Types.ObjectId,
    session: ClientSession,
  ): Promise<CascadedComments> {
    switch (type) {
      case ReportContentType.POST: {
        const { deletedCount } = await this.postModel.deleteOne({ _id: id }, { session }).exec();
        if (deletedCount !== 1) throw new NotFoundException('Content not found');
        const commentIds = await this.commentModel.distinct('_id', { post: id }).session(session).exec();
        await this.commentModel.deleteMany({ post: id }, { session }).exec();
        await this.likeModel.deleteMany({ post: id }, { session }).exec();
        return commentIds as Types.ObjectId[];
      }
      case ReportContentType.COMMENT: {
        const comment = await this.commentModel
          .findOneAndDelete({ _id: id }, { session })
          .select('post')
          .lean<{ post: Types.ObjectId }>()
          .exec();
        if (!comment) throw new NotFoundException('Content not found');
        // Atomic decrement that never goes below 0 (same as BLG-07)
        await this.postModel
          .updateOne({ _id: comment.post, commentsCount: { $gt: 0 } }, { $inc: { commentsCount: -1 } }, { session })
          .exec();
        return [];
      }
      case ReportContentType.REVIEW: {
        const { deletedCount } = await this.reviewModel.deleteOne({ _id: id }, { session }).exec();
        if (deletedCount !== 1) throw new NotFoundException('Content not found');
        return [];
      }
      case ReportContentType.ITINERARY: {
        const { deletedCount } = await this.itineraryModel.deleteOne({ _id: id }, { session }).exec();
        if (deletedCount !== 1) throw new NotFoundException('Content not found');
        const days = await this.itineraryDayModel
          .find({ itineraryId: id }, { _id: 1 }, { session })
          .lean<{ _id: Types.ObjectId }[]>()
          .exec();
        const dayIds = days.map((day) => day._id);
        await this.activityModel.deleteMany({ dayId: { $in: dayIds } }, { session }).exec();
        await this.budgetEntryModel.deleteMany({ dayId: { $in: dayIds } }, { session }).exec();
        await this.transportCostModel.deleteMany({ dayId: { $in: dayIds } }, { session }).exec();
        await this.itineraryDayModel.deleteMany({ itineraryId: id }, { session }).exec();
        await this.bookingLinks.deleteMany({ itineraryId: id }, { session }).exec();
        return [];
      }
    }
  }

  // Close every remaining open report about the moderated item (and about comments deleted with a post),
  // so no orphan reports stay in the queue
  private async resolveOpenReports(
    type: ReportContentType,
    id: Types.ObjectId,
    cascadedComments: CascadedComments,
    session: ClientSession,
  ): Promise<number> {
    const targets: Record<string, unknown>[] = [{ contentType: type, contentId: id }];
    if (cascadedComments.length > 0) {
      targets.push({ contentType: ReportContentType.COMMENT, contentId: { $in: cascadedComments } });
    }
    const { modifiedCount } = await this.reportModel
      .updateMany({ status: ReportStatus.OPEN, $or: targets }, { $set: { status: ReportStatus.RESOLVED } }, { session })
      .exec();
    return modifiedCount;
  }

  // One query per content type on the page; the preview is shown to admins even for hidden content
  private async loadPreviews(reports: ReportRow[]): Promise<Map<string, string>> {
    const idsByType = new Map<ReportContentType, Types.ObjectId[]>();
    for (const report of reports) {
      const ids = idsByType.get(report.contentType) ?? [];
      ids.push(report.contentId);
      idsByType.set(report.contentType, ids);
    }
    const previews = new Map<string, string>();
    await this.runDb('Could not load the reported content', () =>
      Promise.all(
        [...idsByType].map(async ([type, ids]) => {
          for (const { id, text } of await this.findPreviews(type, ids)) {
            previews.set(this.contentKey(type, id), text);
          }
        }),
      ),
    );
    return previews;
  }

  private async findPreviews(type: ReportContentType, ids: Types.ObjectId[]): Promise<{ id: Types.ObjectId; text: string }[]> {
    switch (type) {
      case ReportContentType.POST: {
        const posts = await this.postModel
          .find({ _id: { $in: ids } })
          .select('title')
          .lean<{ _id: Types.ObjectId; title?: string }[]>()
          .exec();
        return posts.map((post) => ({ id: post._id, text: post.title ?? '' }));
      }
      case ReportContentType.COMMENT: {
        const comments = await this.commentModel
          .find({ _id: { $in: ids } })
          .select('text')
          .lean<{ _id: Types.ObjectId; text?: string }[]>()
          .exec();
        return comments.map((comment) => ({ id: comment._id, text: this.excerpt(comment.text) }));
      }
      case ReportContentType.REVIEW: {
        const reviews = await this.reviewModel
          .find({ _id: { $in: ids } })
          .select('comment rating')
          .lean<{ _id: Types.ObjectId; comment?: string; rating?: number }[]>()
          .exec();
        return reviews.map((review) => ({
          id: review._id,
          text: review.comment?.trim() ? this.excerpt(review.comment) : `Rating ${review.rating ?? '-'}/5`,
        }));
      }
      case ReportContentType.ITINERARY: {
        const itineraries = await this.itineraryModel
          .find({ _id: { $in: ids } })
          .select('title')
          .lean<{ _id: Types.ObjectId; title?: string }[]>()
          .exec();
        return itineraries.map((itinerary) => ({ id: itinerary._id, text: itinerary.title ?? '' }));
      }
    }
  }

  // One query for all reporters on the page. Only the display name is read, never email, password or tokens.
  private async loadReporterNames(reports: ReportRow[]): Promise<Map<string, string>> {
    const ids = [...new Set(reports.map((report) => report.reporter.toString()))];
    if (ids.length === 0) return new Map();
    const users = await this.runDb('Could not load the reporters', () =>
      this.userModel
        .find({ _id: { $in: ids } })
        .select('firstName lastName')
        .lean<{ _id: Types.ObjectId; firstName?: string; lastName?: string }[]>()
        .exec(),
    );
    return new Map(
      users.map((user) => [user._id.toString(), `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || DELETED_USER]),
    );
  }

  private excerpt(text: string | undefined): string {
    return Array.from((text ?? '').trim()).slice(0, REPORT_PREVIEW_LENGTH).join('').trim();
  }

  private contentKey(type: ReportContentType, id: Types.ObjectId): string {
    return `${type}:${id.toString()}`;
  }

  private alreadyClosed(): ConflictException {
    return new ConflictException('This report has already been resolved or dismissed');
  }

  // The admin id always comes from the authenticated token; it is checked before anything changes
  private requireAdminId(adminId: string): void {
    if (typeof adminId !== 'string' || !isValidObjectId(adminId) || !OBJECT_ID_PATTERN.test(adminId)) {
      throw new UnauthorizedException('Not authenticated');
    }
  }

  // Re-check the input at the service boundary; never assume the DTO ran or the types are right
  private toObjectId(value: unknown, field: string, message: string): Types.ObjectId {
    if (typeof value !== 'string' || !OBJECT_ID_PATTERN.test(value)) throw this.fieldError(field, message);
    return new Types.ObjectId(value);
  }

  private toContentType(value: unknown): ReportContentType {
    if (typeof value !== 'string' || !(Object.values(ReportContentType) as string[]).includes(value)) {
      throw this.fieldError('type', 'Content type must be post, comment, review or itinerary');
    }
    return value as ReportContentType;
  }

  private toResolveAction(value: unknown): ResolveAction {
    if (typeof value !== 'string' || !(Object.values(ResolveAction) as string[]).includes(value)) {
      throw this.fieldError('action', 'Action must be dismiss, hide or delete');
    }
    return value as ResolveAction;
  }

  private toStatus(value: unknown): ReportStatus {
    if (typeof value !== 'string' || !(Object.values(ReportStatus) as string[]).includes(value)) {
      throw this.fieldError('status', 'Status must be open, dismissed or resolved');
    }
    return value as ReportStatus;
  }

  private toPage(value: unknown): number {
    if (!Number.isSafeInteger(value) || (value as number) < 1) {
      throw this.fieldError('page', 'Page must be a whole number of at least 1');
    }
    return value as number;
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
