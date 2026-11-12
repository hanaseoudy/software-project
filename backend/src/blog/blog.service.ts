import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Error as MongooseError, isValidObjectId, Model, PipelineStage, Types } from 'mongoose';
import { CreatePostDto } from './dto/create-post.dto';
import { MyPostsPage } from './dto/my-post-response.dto';
import { PostResponseDto } from './dto/post-response.dto';
import { TagPostsPage, TagsPage } from './dto/tag-response.dto';
import { UpdateTagsDto } from './dto/update-tags.dto';
import { Post, PostDocument, PostStatus } from './schemas/post.schema';
import { escapeRegex, normalizeTags } from './tag-rules';
import { PAGE_SIZE, paginate, skipFor } from '../common/pagination/pagination';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

// Only published, non-hidden posts are public
const VISIBLE_POSTS = { status: PostStatus.PUBLISHED, isHidden: { $ne: true } };

@Injectable()
export class BlogService {
  constructor(@InjectModel(Post.name) private readonly postModel: Model<PostDocument>) {}

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