import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { Post, PostDocument, PostStatus } from './schemas/post.schema';
import { Comment, CommentDocument } from './schemas/comment.schema';
import { Like, LikeDocument } from './schemas/like.schema';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';

@Injectable()
export class BlogService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<PostDocument>,
    @InjectModel(Comment.name)
    private readonly commentModel: Model<CommentDocument>,
    @InjectModel(Like.name) private readonly likeModel: Model<LikeDocument>,
  ) {}

  private normalizeTags(tags: string[]) {
    return [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  }

  private requireUser(userId: string) {
    if (!userId || !isValidObjectId(userId)) {
      throw new UnauthorizedException('Login required');
    }
  }

  // finds a published, visible post or throws 404
  private async getVisiblePost(postId: string) {
    if (!isValidObjectId(postId)) throw new NotFoundException('Post not found');
    const post = await this.postModel.findOne({
      _id: postId,
      status: PostStatus.PUBLISHED,
      isHidden: false,
    });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  // BLG-01: create a post as draft or published
  async createPost(authorId: string, dto: CreatePostDto) {
    this.requireUser(authorId);
    return this.postModel.create({
      title: dto.title,
      content: dto.content,
      tags: this.normalizeTags(dto.tags ?? []),
      status: dto.status ?? PostStatus.DRAFT,
      author: new Types.ObjectId(authorId),
    });
  }

  // BLG-02: paginated list of published posts, optional tag filter
  async listPublished(query: ListPostsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const filter: Record<string, any> = {
      status: PostStatus.PUBLISHED,
      isHidden: false,
    };
    if (query.tag) filter.tags = query.tag.trim().toLowerCase();

    const [items, total] = await Promise.all([
      this.postModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.postModel.countDocuments(filter),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // BLG-02 + BLG-05: one published post with its comments, oldest first
  async getPublishedById(id: string) {
    if (!isValidObjectId(id)) throw new NotFoundException('Post not found');
    const post = await this.postModel
      .findOne({ _id: id, status: PostStatus.PUBLISHED, isHidden: false })
      .lean();
    if (!post) throw new NotFoundException('Post not found');
    const comments = await this.commentModel
      .find({ post: post._id, isHidden: false })
      .sort({ createdAt: 1 })
      .lean();
    return { ...post, comments };
  }

  // BLG-03: my own posts, including drafts
  async listMine(authorId: string, query: ListPostsQueryDto) {
    this.requireUser(authorId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const filter = { author: new Types.ObjectId(authorId) };

    const [items, total] = await Promise.all([
      this.postModel
        .find(filter)
        .select('title status createdAt likesCount commentsCount')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.postModel.countDocuments(filter),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // finds a post and checks that the caller is its author
  private async getOwnedPost(userId: string, id: string) {
    this.requireUser(userId);
    if (!isValidObjectId(id)) throw new NotFoundException('Post not found');
    const post = await this.postModel.findById(id);
    if (!post) throw new NotFoundException('Post not found');
    if (post.author.toString() !== userId) {
      throw new ForbiddenException('You can only change your own posts');
    }
    return post;
  }

  // BLG-04: edit my own post
  async updatePost(userId: string, id: string, dto: UpdatePostDto) {
    const post = await this.getOwnedPost(userId, id);
    if (dto.title !== undefined) post.title = dto.title;
    if (dto.content !== undefined) post.content = dto.content;
    if (dto.tags !== undefined) post.tags = this.normalizeTags(dto.tags);
    if (dto.status !== undefined) post.status = dto.status;
    return post.save();
  }

  // BLG-04: delete my own post together with its comments and likes
  async deletePost(userId: string, id: string) {
    const post = await this.getOwnedPost(userId, id);
    await Promise.all([
      this.commentModel.deleteMany({ post: post._id }),
      this.likeModel.deleteMany({ post: post._id }),
    ]);
    await post.deleteOne();
    return { message: 'Post deleted' };
  }

  // BLG-05: comment on a published post (1-500 chars)
  async addComment(userId: string, postId: string, dto: CreateCommentDto) {
    this.requireUser(userId);
    const post = await this.getVisiblePost(postId);
    const comment = await this.commentModel.create({
      post: post._id,
      author: new Types.ObjectId(userId),
      text: dto.text,
    });
    await this.postModel.updateOne(
      { _id: post._id },
      { $inc: { commentsCount: 1 } },
    );
    return comment;
  }

  // BLG-06: like a post once (unique index post + user blocks duplicates)
  async likePost(userId: string, postId: string) {
    this.requireUser(userId);
    const post = await this.getVisiblePost(postId);
    try {
      await this.likeModel.create({
        post: post._id,
        user: new Types.ObjectId(userId),
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new ConflictException('You already liked this post');
      }
      throw err;
    }
    const updated = await this.postModel
      .findByIdAndUpdate(post._id, { $inc: { likesCount: 1 } }, { new: true })
      .select('likesCount')
      .lean();
    return { liked: true, likesCount: updated?.likesCount ?? 0 };
  }

  // BLG-06: remove my like
  async unlikePost(userId: string, postId: string) {
    this.requireUser(userId);
    const post = await this.getVisiblePost(postId);
    const result = await this.likeModel.deleteOne({
      post: post._id,
      user: new Types.ObjectId(userId),
    });
    if (result.deletedCount === 0) {
      throw new NotFoundException('You have not liked this post');
    }
    const updated = await this.postModel
      .findByIdAndUpdate(post._id, { $inc: { likesCount: -1 } }, { new: true })
      .select('likesCount')
      .lean();
    return { liked: false, likesCount: Math.max(updated?.likesCount ?? 0, 0) };
  }

  // finds a comment and checks that the caller wrote it
  private async getOwnedComment(userId: string, id: string) {
    this.requireUser(userId);
    if (!isValidObjectId(id)) throw new NotFoundException('Comment not found');
    const comment = await this.commentModel.findById(id);
    if (!comment || comment.isHidden) {
      throw new NotFoundException('Comment not found');
    }
    if (comment.author.toString() !== userId) {
      throw new ForbiddenException('You can only change your own comments');
    }
    return comment;
  }

  // BLG-07: edit my own comment
  async updateComment(userId: string, id: string, dto: UpdateCommentDto) {
    const comment = await this.getOwnedComment(userId, id);
    comment.text = dto.text;
    return comment.save();
  }

  // BLG-07: delete my own comment and update the post's comment count
  async deleteComment(userId: string, id: string) {
    const comment = await this.getOwnedComment(userId, id);
    await comment.deleteOne();
    await this.postModel.updateOne(
      { _id: comment.post, commentsCount: { $gt: 0 } },
      { $inc: { commentsCount: -1 } },
    );
    return { message: 'Comment deleted' };
  }
} 