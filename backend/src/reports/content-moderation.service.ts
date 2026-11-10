import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { Comment } from '../blog/schemas/comment.schema';
import { Like } from '../blog/schemas/like.schema';
import { Post } from '../blog/schemas/post.schema';
import { ImageCategory } from '../uploads/uploads.constants';
import { UploadsService } from '../uploads/uploads.service';
import { ReportAction, ReportStatus, ReportTargetType } from './enums/report.enums';
import { isModeratable, moderationUnavailableMessage, statusForAction } from './moderation.helpers';
import { Report, ReportDocument } from './schemas/report.schema';

export interface ContentChange {
  targetType: ReportTargetType;
  targetId: string;
  action: ReportAction | 'unhide';
  isHidden?: boolean;
  deleted: boolean;
  resolvedReports: number;
}

const NOT_FOUND: Record<string, string> = { post: 'Post not found', comment: 'Comment not found' };

// GEN-10: hide / unhide / delete posts and comments (reviews and itineraries are not available yet)
@Injectable()
export class ContentModerationService {
  constructor(
    @InjectModel(Report.name) private readonly reportModel: Model<ReportDocument>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(Comment.name) private readonly commentModel: Model<Comment>,
    @InjectModel(Like.name) private readonly likeModel: Model<Like>,
    private readonly uploads: UploadsService,
  ) {}

  /** 400 for types that cannot be moderated yet, 404 if the content does not exist. */
  async assertCanModerate(type: ReportTargetType, id: string): Promise<void> {
    if (!isModeratable(type)) throw new BadRequestException(moderationUnavailableMessage(type));
    const model: Model<any> = type === ReportTargetType.POST ? this.postModel : this.commentModel;
    if (!isValidObjectId(id) || !(await model.exists({ _id: id }))) {
      throw new NotFoundException(NOT_FOUND[type]);
    }
  }

  async setHidden(type: ReportTargetType, id: string, hidden: boolean): Promise<Omit<ContentChange, 'resolvedReports'>> {
    await this.assertCanModerate(type, id);
    const model: Model<any> = type === ReportTargetType.POST ? this.postModel : this.commentModel;
    const res = await model.updateOne({ _id: id }, { $set: { isHidden: hidden } });
    if (res.matchedCount === 0) throw new NotFoundException(NOT_FOUND[type]);
    return { targetType: type, targetId: id, action: hidden ? ReportAction.HIDE : 'unhide', isHidden: hidden, deleted: false };
  }

  async delete(type: ReportTargetType, id: string, adminId: string): Promise<Omit<ContentChange, 'resolvedReports'>> {
    await this.assertCanModerate(type, id);
    if (type === ReportTargetType.POST) await this.deletePost(id, adminId);
    else await this.deleteComment(id);
    return { targetType: type, targetId: id, action: ReportAction.DELETE, deleted: true };
  }

  // A post is deleted together with its comments, likes and stored image files.
  private async deletePost(id: string, adminId: string): Promise<void> {
    const post = await this.postModel.findById(id).lean();
    if (!post) throw new NotFoundException(NOT_FOUND.post);

    const commentIds = (await this.commentModel.find({ post: post._id }, { _id: 1 }).lean()).map((c) => c._id);
    await Promise.all([
      this.commentModel.deleteMany({ post: post._id }),
      this.likeModel.deleteMany({ post: post._id }),
    ]);
    await this.postModel.deleteOne({ _id: post._id });

    // reports on the deleted comments are closed too, so they do not stay open for content that is gone
    if (commentIds.length > 0) {
      await this.resolveOpenReports(ReportTargetType.COMMENT, commentIds, ReportAction.DELETE, adminId);
    }
    await Promise.all(
      (post.images ?? [])
        .filter((image) => this.uploads.isStoredUrl(ImageCategory.POST, image.url))
        .map((image) => this.uploads.deleteByUrl(image.url).catch(() => undefined)),
    );
  }

  private async deleteComment(id: string): Promise<void> {
    const comment = await this.commentModel.findOneAndDelete({ _id: id }).lean();
    if (!comment) throw new NotFoundException(NOT_FOUND.comment);
    await this.postModel.updateOne(
      { _id: comment.post, commentsCount: { $gt: 0 } },
      { $inc: { commentsCount: -1 } },
    );
  }

  /** Closes every open report on the given item(s); returns how many were closed. */
  async resolveOpenReports(
    type: ReportTargetType,
    ids: (string | Types.ObjectId)[],
    action: ReportAction,
    adminId: string,
  ): Promise<number> {
    const res = await this.reportModel.updateMany(
      {
        targetType: type,
        targetId: { $in: ids.map((id) => new Types.ObjectId(String(id))) },
        status: ReportStatus.OPEN,
      },
      {
        $set: {
          status: statusForAction(action) as ReportStatus,
          action,
          resolvedBy: new Types.ObjectId(adminId),
          resolvedAt: new Date(),
        },
      },
    );
    return res.modifiedCount;
  }
}
