import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Error as MongooseError, isValidObjectId, Model, PipelineStage, Types } from 'mongoose';
import { CommentResponseDto } from './dto/comment-response.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { LikeResponseDto } from './dto/like-response.dto';
import { MyPostsPage } from './dto/my-post-response.dto';
import { PostResponseDto } from './dto/post-response.dto';
import { PublicAuthorDto, PublicPostDetailDto, PublicPostsPage } from './dto/public-post-response.dto';
import { TagPostsPage, TagsPage } from './dto/tag-response.dto';
import { UpdateTagsDto } from './dto/update-tags.dto';
import { commentTextError } from './comment-rules';
import { Comment, CommentDocument } from './schemas/comment.schema';
import { Like, LikeDocument } from './schemas/like.schema';
import { Post, PostDocument, PostStatus } from './schemas/post.schema';
import { escapeRegex, normalizeTags } from './tag-rules';
import { PAGE_SIZE, paginate, skipFor } from '../common/pagination/pagination';
import { AccountStatus, User, UserDocument } from '../users/schemas/user.schema';

// BLG-02: list rows show the first 200 characters of the body
const EXCERPT_LENGTH = 200;

// ACC-12: comments of deactivated (or missing) accounts are shown under this name
const DELETED_USER = 'Deleted user';

type PublicUser = { name: string; deactivated: boolean };

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

// Only published, non-hidden posts are public
const VISIBLE_POSTS = { status: PostStatus.PUBLISHED, isHidden: { $ne: true } };

const DUPLICATE_KEY = 11000;

@Injectable()
export class BlogService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<PostDocument>,
    @InjectModel(Like.name) private readonly likeModel: Model<LikeDocument>,
    @InjectModel(Comment.name) private readonly commentModel: Model<CommentDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  // BLG-01: the author always comes from the logged-in user, never from the request body
  async create(authorId: string, dto: CreatePostDto): Promise<PostResponseDto> {
    // BLG-08: tags are re-checked in the service and by the schema validators
    const tags = normalizeTags(dto.tags);
    const post = await this.runDb('Could not create the post', () =>
      this.postModel.create({
        title: dto.title,
        content: dto.content,
        status: dto.status ?? PostStatus.DRAFT,
        tags,
        author: new Types.ObjectId(authorId),
      }),
    );
    return this.toResponse(post);
  }

  // BLG-03: the logged-in user's own posts, drafts and hidden posts included, newest first.
  // GEN-05: fixed page size of 10.
  async listMine(authorId: string, page = 1): Promise<MyPostsPage> {
    if (!authorId || !isValidObjectId(authorId)) {
      throw new UnauthorizedException('Not authenticated');
    }
    const filter = { author: new Types.ObjectId(authorId) };
    const [posts, total] = await Promise.all([
      this.postModel
        .find(filter)
        .select('title status createdAt likesCount commentsCount')
        .sort({ createdAt: -1, _id: -1 })
        .skip(skipFor(page))
        .limit(PAGE_SIZE)
        .lean<(Post & { _id: Types.ObjectId; createdAt: Date })[]>()
        .exec(),
      this.postModel.countDocuments(filter).exec(),
    ]);
    const items = posts.map((post) => ({
      id: post._id.toString(),
      title: post.title,
      status: post.status,
      createdAt: post.createdAt,
      likesCount: post.likesCount ?? 0,
      commentsCount: post.commentsCount ?? 0,
    }));
    return paginate(items, total, page);
  }

  // BLG-02: public list of published, non-hidden posts, newest first, optional tag filter, page size 10 (GEN-05).
  // ACC-12: posts of deactivated authors are hidden.
  async listPublished(tag: string | undefined, page = 1): Promise<PublicPostsPage> {
    const deactivated = await this.runDb('Could not load the posts', () =>
      this.userModel.distinct('_id', { status: AccountStatus.DEACTIVATED }).exec(),
    );
    const filter = {
      ...VISIBLE_POSTS,
      author: { $nin: deactivated },
      ...(tag !== undefined ? { tags: String(tag).trim().toLowerCase() } : {}),
    };
    const [posts, total] = await this.runDb('Could not load the posts', () =>
      Promise.all([
        this.postModel
          .find(filter)
          .select('title author content tags images likesCount commentsCount createdAt')
          .sort({ createdAt: -1, _id: -1 })
          .skip(skipFor(page))
          .limit(PAGE_SIZE)
          .lean<(Post & { _id: Types.ObjectId; createdAt: Date })[]>()
          .exec(),
        this.postModel.countDocuments(filter).exec(),
      ]),
    );
    const users = await this.loadPublicUsers(posts.map((post) => post.author));
    const items = posts.map((post) => ({
      id: post._id.toString(),
      title: post.title,
      author: this.toPublicAuthor(users, post.author),
      createdAt: post.createdAt,
      excerpt: Array.from((post.content ?? '').trim()).slice(0, EXCERPT_LENGTH).join('').trim(),
      tags: post.tags ?? [],
      images: (post.images ?? []).map((image) => image.url),
      likesCount: post.likesCount ?? 0,
      commentsCount: post.commentsCount ?? 0,
    }));
    return paginate(items, total, page);
  }

  // BLG-02: public post page. 404 for an invalid id, a missing, draft or hidden post,
  // or a post by a deactivated author (ACC-12). Visible comments are shown oldest first (BLG-05).
  async getPublished(postId: string): Promise<PublicPostDetailDto> {
    if (typeof postId !== 'string' || !OBJECT_ID_PATTERN.test(postId)) {
      throw new NotFoundException('Post not found');
    }
    const post = await this.runDb('Could not load the post', () =>
      this.postModel
        .findOne({ _id: new Types.ObjectId(postId), ...VISIBLE_POSTS })
        .select('title author content tags images likesCount createdAt')
        .lean<Post & { _id: Types.ObjectId; createdAt: Date }>()
        .exec(),
    );
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    const comments = await this.runDb('Could not load the comments', () =>
      this.commentModel
        .find({ post: post._id, isHidden: { $ne: true } })
        .select('author text createdAt')
        .sort({ createdAt: 1, _id: 1 })
        .lean<(Comment & { _id: Types.ObjectId; createdAt: Date })[]>()
        .exec(),
    );
    const users = await this.loadPublicUsers([post.author, ...comments.map((comment) => comment.author)]);
    if (users.get(post.author.toString())?.deactivated) {
      throw new NotFoundException('Post not found');
    }
    return {
      id: post._id.toString(),
      title: post.title,
      author: this.toPublicAuthor(users, post.author),
      createdAt: post.createdAt,
      content: post.content,
      tags: post.tags ?? [],
      images: (post.images ?? []).map((image) => image.url),
      likesCount: post.likesCount ?? 0,
      comments: comments.map((comment) => ({
        id: comment._id.toString(),
        author: this.toPublicAuthor(users, comment.author),
        text: comment.text,
        createdAt: comment.createdAt,
      })),
    };
  }

  // One query for all authors on the page (no N+1). Only the display name and status are read,
  // never email, password, phone, role or tokens.
  private async loadPublicUsers(ids: Types.ObjectId[]): Promise<Map<string, PublicUser>> {
    const uniqueIds = [...new Set(ids.map((id) => id.toString()))];
    if (uniqueIds.length === 0) return new Map();
    const users = await this.runDb('Could not load the authors', () =>
      this.userModel
        .find({ _id: { $in: uniqueIds } })
        .select('firstName lastName status')
        .lean<{ _id: Types.ObjectId; firstName?: string; lastName?: string; status?: AccountStatus }[]>()
        .exec(),
    );
    return new Map(
      users.map((user) => [
        user._id.toString(),
        {
          name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
          deactivated: user.status === AccountStatus.DEACTIVATED,
        },
      ]),
    );
  }

  // ACC-12: deactivated or missing accounts are shown as "Deleted user" without an id
  private toPublicAuthor(users: Map<string, PublicUser>, id: Types.ObjectId): PublicAuthorDto {
    const user = users.get(id.toString());
    return user && !user.deactivated ? { id: id.toString(), name: user.name } : { id: null, name: DELETED_USER };
  }

  // BLG-08: the author edits the post's tags later. BLG-04 will extend this with the other fields.
  async update(userId: string, postId: string, dto: UpdateTagsDto): Promise<PostResponseDto> {
    if (!userId || !isValidObjectId(userId)) {
      throw new UnauthorizedException('Not authenticated');
    }
    if (typeof postId !== 'string' || !OBJECT_ID_PATTERN.test(postId)) {
      throw new NotFoundException('Post not found');
    }
    const post = await this.runDb('Could not load the post', () => this.postModel.findById(postId).exec());
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    if (!post.author.equals(userId)) {
      throw new ForbiddenException('You can only edit your own posts');
    }
    if (dto.tags !== undefined) {
      post.tags = normalizeTags(dto.tags);
    }
    const saved = await this.runDb('Could not update the post', () => post.save());
    return this.toResponse(saved);
  }

  // BLG-08: clickable tag. Published, non-hidden posts with the tag, newest first, page size 10 (GEN-05).
  async listByTag(tag: string, page = 1): Promise<TagPostsPage> {
    const filter = { ...VISIBLE_POSTS, tags: String(tag).trim().toLowerCase() };
    const [posts, total] = await this.runDb('Could not load the posts', () =>
      Promise.all([
        this.postModel
          .find(filter)
          .select('title author tags status likesCount commentsCount createdAt')
          .sort({ createdAt: -1, _id: -1 })
          .skip(skipFor(page))
          .limit(PAGE_SIZE)
          .lean<(Post & { _id: Types.ObjectId; createdAt: Date })[]>()
          .exec(),
        this.postModel.countDocuments(filter).exec(),
      ]),
    );
    const items = posts.map((post) => ({
      id: post._id.toString(),
      title: post.title,
      author: post.author.toString(),
      tags: post.tags ?? [],
      status: post.status,
      likesCount: post.likesCount ?? 0,
      commentsCount: post.commentsCount ?? 0,
      createdAt: post.createdAt,
    }));
    return paginate(items, total, page);
  }

  // BLG-08: searchable tags. Tags used by published, non-hidden posts whose name contains the search text,
  // most used first, then by name, page size 10 (GEN-05).
  async searchTags(search: string | undefined, page = 1): Promise<TagsPage> {
    const text = typeof search === 'string' ? search.trim().toLowerCase() : '';
    const pipeline: PipelineStage[] = [
      { $match: VISIBLE_POSTS },
      { $unwind: '$tags' },
      ...(text ? [{ $match: { tags: { $regex: escapeRegex(text), $options: 'i' } } }] : []),
      { $group: { _id: '$tags', postsCount: { $sum: 1 } } },
      {
        $facet: {
          items: [{ $sort: { postsCount: -1, _id: 1 } }, { $skip: skipFor(page) }, { $limit: PAGE_SIZE }],
          total: [{ $count: 'count' }],
        },
      },
    ];
    const [result] = await this.runDb('Could not load the tags', () =>
      this.postModel
        .aggregate<{ items: { _id: string; postsCount: number }[]; total: { count: number }[] }>(pipeline)
        .exec(),
    );
    const items = (result?.items ?? []).map((tag) => ({ name: tag._id, postsCount: tag.postsCount }));
    return paginate(items, result?.total[0]?.count ?? 0, page);
  }

  // Map Mongoose validation errors to 400 (GEN-02 shape) and other database failures to 500
  // BLG-06: like a published, visible post at most once.
  // The unique (post, user) index is the real guard, so concurrent requests cannot create two likes.
  async likePost(userId: string, postId: string): Promise<LikeResponseDto> {
    const user = this.toUserObjectId(userId);
    const post = await this.findLikeablePostId(postId);

    try {
      await this.likeModel.create({ post, user });
    } catch (error) {
      if ((error as { code?: number })?.code === DUPLICATE_KEY) {
        throw new ConflictException('You have already liked this post');
      }
      throw new InternalServerErrorException('Could not like the post');
    }

    // Count only after the like was stored; atomic $inc keeps the counter in sync under concurrency
    let updated: { likesCount: number } | null;
    try {
      updated = await this.postModel
        .findOneAndUpdate({ _id: post }, { $inc: { likesCount: 1 } }, { new: true, projection: { likesCount: 1 } })
        .lean<{ likesCount: number }>()
        .exec();
    } catch {
      // The like was stored but not counted: undo it so the counter does not drift
      await this.likeModel.deleteOne({ post, user }).exec().catch(() => undefined);
      throw new InternalServerErrorException('Could not like the post');
    }
    if (!updated) {
      // The post was deleted between the check and the update: do not leave an orphan like behind
      await this.runDb('Could not like the post', () => this.likeModel.deleteOne({ post, user }).exec());
      throw new NotFoundException('Post not found');
    }
    return { liked: true, likesCount: updated.likesCount };
  }

  // BLG-06: remove the logged-in user's like from a published, visible post
  async unlikePost(userId: string, postId: string): Promise<LikeResponseDto> {
    const user = this.toUserObjectId(userId);
    const post = await this.findLikeablePostId(postId);

    const { deletedCount } = await this.runDb('Could not remove the like', () =>
      this.likeModel.deleteOne({ post, user }).exec(),
    );
    if (deletedCount === 0) {
      throw new NotFoundException('You have not liked this post');
    }

    // Decrement only after a like was really removed, and never below 0
    let updated: { likesCount: number } | null;
    try {
      updated = await this.postModel
        .findOneAndUpdate(
          { _id: post, likesCount: { $gt: 0 } },
          { $inc: { likesCount: -1 } },
          { new: true, projection: { likesCount: 1 } },
        )
        .lean<{ likesCount: number }>()
        .exec();
    } catch {
      // The like was removed but the count was not: restore the like so the counter does not drift
      await this.likeModel.create({ post, user }).catch(() => undefined);
      throw new InternalServerErrorException('Could not remove the like');
    }
    return { liked: false, likesCount: updated?.likesCount ?? 0 };
  }

  // BLG-05: comment on a published, non-hidden post. Order of checks: 401 (user), 400 (text), 404 (post).
  async addComment(userId: string, postId: string, text: unknown): Promise<CommentResponseDto> {
    const author = this.toUserObjectId(userId);
    const body = this.toCommentText(text);
    const post = await this.findLikeablePostId(postId);

    const comment = await this.runDb('Could not add the comment', () =>
      this.commentModel.create({ post, author, text: body }),
    );

    // Count only after the comment was stored; atomic $inc keeps the counter in sync under concurrency
    try {
      const { matchedCount } = await this.postModel.updateOne({ _id: post }, { $inc: { commentsCount: 1 } }).exec();
      if (matchedCount === 0) {
        throw new NotFoundException('Post not found');
      }
    } catch (error) {
      // The comment was stored but not counted (or the post was just deleted): undo it so nothing drifts
      await this.commentModel.deleteOne({ _id: comment._id }).exec().catch(() => undefined);
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Could not add the comment');
    }

    return {
      id: comment._id.toString(),
      postId: post.toString(),
      author: { id: author.toString() },
      text: comment.text,
      createdAt: comment.get('createdAt') as Date,
    };
  }

  // BLG-05: service-level check that never assumes the text is a string (same rules as CreateCommentDto)
  private toCommentText(value: unknown): string {
    const error = commentTextError(value);
    if (error) {
      throw new BadRequestException({ message: 'Validation failed', errors: { text: [error] } });
    }
    return (value as string).trim();
  }

  private toUserObjectId(userId: string): Types.ObjectId {
    if (!userId || !isValidObjectId(userId)) {
      throw new UnauthorizedException('Not authenticated');
    }
    return new Types.ObjectId(userId);
  }

  // 404 for an invalid id, a missing post, a draft or a hidden post (BLG-06 only applies to visible posts)
  private async findLikeablePostId(postId: string): Promise<Types.ObjectId> {
    // Strict check: Mongoose's isValidObjectId also accepts any 12-character string
    if (typeof postId !== 'string' || !OBJECT_ID_PATTERN.test(postId)) {
      throw new NotFoundException('Post not found');
    }
    const post = await this.runDb('Could not load the post', () =>
      this.postModel
        .findOne({ _id: new Types.ObjectId(postId), status: PostStatus.PUBLISHED, isHidden: { $ne: true } })
        .select('_id')
        .lean<{ _id: Types.ObjectId }>()
        .exec(),
    );
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    return post._id;
  }

  // Map unexpected database failures to a clean 500 instead of leaking driver errors
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

  private toResponse(post: PostDocument): PostResponseDto {
    const { createdAt, updatedAt } = post as PostDocument & { createdAt: Date; updatedAt: Date };
    return {
      id: post._id.toString(),
      title: post.title,
      content: post.content,
      status: post.status,
      tags: post.tags,
      images: post.images.map((image) => ({ id: String(image._id), url: image.url })),
      author: post.author.toString(),
      likesCount: post.likesCount,
      commentsCount: post.commentsCount,
      createdAt,
      updatedAt,
    };
  }
}