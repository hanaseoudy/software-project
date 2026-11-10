import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { Comment } from '../blog/schemas/comment.schema';
import { Post } from '../blog/schemas/post.schema';
import { Review } from '../hotel-bookings/schemas/review.schema';
import { ContentChange, ContentModerationService } from './content-moderation.service';
import { AdminListReportsQueryDto } from './dto/admin-list-reports-query.dto';
import { ReportAction, ReportStatus, ReportTargetType } from './enums/report.enums';
import { itemKey, previewFor, PreviewSource, REPORT_ALREADY_RESOLVED_MESSAGE } from './moderation.helpers';
import {
  Page,
  paginate,
  REPORTS_PAGE_SIZE,
  ReportView,
  skipFor,
  toReportResponse,
} from './reports.helpers';
import { Report, ReportDocument } from './schemas/report.schema';

export interface AdminReportItem extends ReportView {
  reportCount: number;
  preview: string | null;
  contentExists: boolean;
}

export interface ResolveResult {
  report: ReportView;
  resolvedReports: number;
  content?: Omit<ContentChange, 'resolvedReports'>;
}

// GEN-10: admin list of reports and report resolution
@Injectable()
export class AdminReportsService {
  constructor(
    @InjectModel(Report.name) private readonly reportModel: Model<ReportDocument>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(Comment.name) private readonly commentModel: Model<Comment>,
    @InjectModel(Review.name) private readonly reviewModel: Model<Review>,
    private readonly moderation: ContentModerationService,
  ) {}

  async list(query: AdminListReportsQueryDto): Promise<Page<AdminReportItem>> {
    const page = query.page ?? 1;
    const status = query.status ?? ReportStatus.OPEN;
    const filter = { status };

    const [reports, total] = await Promise.all([
      this.reportModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skipFor(page))
        .limit(REPORTS_PAGE_SIZE)
        .lean(),
      this.reportModel.countDocuments(filter),
    ]);
    if (reports.length === 0) return paginate([], total, page);

    const [counts, previews] = await Promise.all([this.countPerItem(reports, status), this.previews(reports)]);
    const items = reports.map((r) => {
      const key = itemKey(r.targetType, r.targetId);
      return {
        ...toReportResponse(r),
        reportCount: counts.get(key) ?? 1,
        preview: previews.get(key) ?? null,
        contentExists: previews.has(key),
      };
    });
    return paginate(items, total, page);
  }

  // number of reports with the same status per item on this page
  private async countPerItem(reports: Report[], status: ReportStatus): Promise<Map<string, number>> {
    const rows = await this.reportModel.aggregate<{ _id: { t: string; i: Types.ObjectId }; n: number }>([
      {
        $match: {
          status,
          $or: reports.map((r) => ({ targetType: r.targetType, targetId: r.targetId })),
        },
      },
      { $group: { _id: { t: '$targetType', i: '$targetId' }, n: { $sum: 1 } } },
    ]);
    return new Map(rows.map((row) => [itemKey(row._id.t, row._id.i), row.n]));
  }

  // short preview of each reported item (content is only read)
  private async previews(reports: Report[]): Promise<Map<string, string | null>> {
    const idsOf = (type: ReportTargetType) =>
      reports.filter((r) => r.targetType === type).map((r) => r.targetId);
    const sources: [ReportTargetType, Model<any>, string][] = [
      [ReportTargetType.POST, this.postModel, 'title content'],
      [ReportTargetType.COMMENT, this.commentModel, 'text'],
      [ReportTargetType.REVIEW, this.reviewModel, 'rating comment'],
    ];

    const out = new Map<string, string | null>();
    await Promise.all(
      sources.map(async ([type, model, fields]) => {
        const ids = idsOf(type);
        if (ids.length === 0) return;
        const docs: (PreviewSource & { _id: Types.ObjectId })[] = await model
          .find({ _id: { $in: ids } }, fields)
          .lean();
        for (const doc of docs) out.set(itemKey(type, doc._id), previewFor(type, doc));
      }),
    );
    return out;
  }

  async resolve(reportId: string, action: ReportAction, adminId: string): Promise<ResolveResult> {
    if (!isValidObjectId(reportId)) throw new NotFoundException('Report not found');
    const report = await this.reportModel.findById(reportId).lean();
    if (!report) throw new NotFoundException('Report not found');
    if (report.status !== ReportStatus.OPEN) throw new ConflictException(REPORT_ALREADY_RESOLVED_MESSAGE);

    const targetId = String(report.targetId);
    let content: ResolveResult['content'];
    if (action === ReportAction.HIDE) {
      content = await this.moderation.setHidden(report.targetType, targetId, true);
    } else if (action === ReportAction.DELETE) {
      content = await this.moderation.delete(report.targetType, targetId, adminId);
    }

    // this report and every other open report on the same item
    const resolvedReports = await this.moderation.resolveOpenReports(
      report.targetType,
      [targetId],
      action,
      adminId,
    );
    const updated = await this.reportModel.findById(reportId).lean();
    if (!updated || updated.action !== action) {
      // another admin resolved it at the same moment with a different action
      throw new ConflictException(REPORT_ALREADY_RESOLVED_MESSAGE);
    }
    return { report: toReportResponse(updated), resolvedReports, content };
  }

  /** Direct moderation without a report; hide / delete also close the item's open reports. */
  async moderate(
    type: ReportTargetType,
    id: string,
    change: 'hide' | 'unhide' | 'delete',
    adminId: string,
  ): Promise<ContentChange> {
    if (change === 'delete') {
      const result = await this.moderation.delete(type, id, adminId);
      const resolvedReports = await this.moderation.resolveOpenReports(type, [id], ReportAction.DELETE, adminId);
      return { ...result, resolvedReports };
    }
    const result = await this.moderation.setHidden(type, id, change === 'hide');
    const resolvedReports =
      change === 'hide'
        ? await this.moderation.resolveOpenReports(type, [id], ReportAction.HIDE, adminId)
        : 0;
    return { ...result, resolvedReports };
  }
}
