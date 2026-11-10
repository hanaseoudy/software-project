import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Comment } from '../blog/schemas/comment.schema';
import { Post } from '../blog/schemas/post.schema';
import { Review } from '../hotel-bookings/schemas/review.schema';
import { CreateReportDto } from './dto/create-report.dto';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';
import { ReportTargetType } from './enums/report.enums';
import {
  ALREADY_REPORTED_MESSAGE,
  isDuplicateKeyError,
  notAvailableMessage,
  Page,
  paginate,
  REPORTS_PAGE_SIZE,
  ReportView,
  skipFor,
  toReportResponse,
  UNAVAILABLE_REPORT_TYPES,
} from './reports.helpers';
import { Report, ReportDocument } from './schemas/report.schema';

// GEN-09: one report per user per content item
@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Report.name) private readonly reportModel: Model<ReportDocument>,
    // Other modules' models, used read-only to check that the reported item exists
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(Comment.name) private readonly commentModel: Model<Comment>,
    @InjectModel(Review.name) private readonly reviewModel: Model<Review>,
  ) {}

  private async targetExists(type: ReportTargetType, id: string): Promise<boolean> {
    const models: Partial<Record<ReportTargetType, Model<any>>> = {
      [ReportTargetType.POST]: this.postModel,
      [ReportTargetType.COMMENT]: this.commentModel,
      [ReportTargetType.REVIEW]: this.reviewModel,
    };
    const model = models[type];
    if (!model) return false;
    return (await model.exists({ _id: id })) !== null;
  }

  async create(reporterId: string, dto: CreateReportDto): Promise<ReportView> {
    if (UNAVAILABLE_REPORT_TYPES.includes(dto.targetType)) {
      throw new BadRequestException(notAvailableMessage(dto.targetType));
    }
    if (!(await this.targetExists(dto.targetType, dto.targetId))) {
      throw new NotFoundException(`${dto.targetType[0].toUpperCase()}${dto.targetType.slice(1)} not found`);
    }

    const key = {
      reporter: new Types.ObjectId(reporterId),
      targetType: dto.targetType,
      targetId: new Types.ObjectId(dto.targetId),
    };
    // friendly check first; the unique index below still blocks two reports sent at the same time
    if (await this.reportModel.exists(key)) throw new ConflictException(ALREADY_REPORTED_MESSAGE);

    try {
      const report = await this.reportModel.create({ ...key, reason: dto.reason });
      return toReportResponse(report);
    } catch (err) {
      if (isDuplicateKeyError(err)) throw new ConflictException(ALREADY_REPORTED_MESSAGE);
      throw err;
    }
  }

  async listMine(reporterId: string, query: ListReportsQueryDto): Promise<Page<ReportView>> {
    const page = query.page ?? 1;
    const filter = { reporter: new Types.ObjectId(reporterId) };
    const [items, total] = await Promise.all([
      this.reportModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skipFor(page))
        .limit(REPORTS_PAGE_SIZE)
        .lean(),
      this.reportModel.countDocuments(filter),
    ]);
    return paginate(items.map((r) => toReportResponse(r)), total, page);
  }
}
