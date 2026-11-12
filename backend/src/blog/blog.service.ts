import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { CreatePostDto } from './dto/create-post.dto';
import { LikeResponseDto } from './dto/like-response.dto';
import { MyPostsPage } from './dto/my-post-response.dto';
import { PostResponseDto } from './dto/post-response.dto';
import { Like, LikeDocument } from './schemas/like.schema';
import { Post, PostDocument, PostStatus } from './schemas/post.schema';
import { PAGE_SIZE, paginate, skipFor } from '../common/pagination/pagination';

const DUPLICATE_KEY = 11000;
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

@Injectable()
export class BlogService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<PostDocument>,
    @InjectModel(Like.name) private readonly likeModel: Model<LikeDocument>,
  ) {}

  // BLG-01: the author always comes from the logged-in user, never from the request body
  async create(authorId: string, dto: CreatePostDto): Promise<PostResponseDto> {
    const post = await this.postModel.create({
      title: dto.title,
      content: dto.content,
      status: dto.status ?? PostStatus.DRAFT,
      tags: dto.tags ?? [],
      author: new Types.ObjectId(authorId),
    });
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