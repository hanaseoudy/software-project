
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';

import { Post, PostDocument, PostStatus } from './schemas/post.schema';
import { Comment, CommentDocument } from './schemas/comment.schema';
import { Like, LikeDocument } from './schemas/like.schema';

import { CreatePostDto } from './dto/create-post.dto';
import { PostResponseDto, toPostResponse } from './dto/post-response.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';
import { ListTagsQueryDto } from './dto/list-tags-query.dto';

@Injectable()
export class BlogService {
  constructor(
    @InjectModel(Post.name)
    private readonly postModel: Model<PostDocument>,

    @InjectModel(Comment.name)
    private readonly commentModel: Model<CommentDocument>,

    @InjectModel(Like.name)
    private readonly likeModel: Model<LikeDocument>,
  ) {}

  // Normalize tags consistently across the application.
  private normalizeTags(tags: unknown): string[] {
    if (!Array.isArray(tags)) {
      return [];
    }

    const clean = tags
      .filter((tag): tag is string => typeof tag === 'string')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);

    return [...new Set(clean)];
  }

  // Validate the tag rules used by BLG-01 and BLG-08.
  private validateTags(tags: string[]): void {
    if (
      tags.length > 5 ||
      tags.some((tag) => tag.length < 1 || tag.length > 30)
    ) {
      throw new BadRequestException(
        'A post can have at most 5 tags, and each tag must contain 1 to 30 characters',
      );
    }
  }

  // Ensure the request comes from an authenticated user.
  private requireUser(userId: string): void {
    if (!userId || !isValidObjectId(userId)) {
      throw new UnauthorizedException('Login required');
    }
  }

  // Convert expected Mongoose validation errors into API errors.
  private mapDbError(err: any): Error {
    if (
      err?.name === 'ValidationError' ||
      err?.name === 'CastError'
    ) {
      return new BadRequestException(err.message);
    }

    return new InternalServerErrorException(
      'Could not save the post',
    );
  }

  // Find a published and visible post.
  private async getVisiblePost(postId: string) {
    if (!isValidObjectId(postId)) {
      throw new NotFoundException('Post not found');
    }

    const post = await this.postModel.findOne({
      _id: postId,
      status: PostStatus.PUBLISHED,
      isHidden: false,
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return post;
  }

  // BLG-01: Create a post as draft or published.
  async createPost(
    authorId: string,
    dto: CreatePostDto,
  ): Promise<PostResponseDto> {
    this.requireUser(authorId);

    const tags = this.normalizeTags(dto.tags);
    this.validateTags(tags);

    try {
      const post = await this.postModel.create({
        title: dto.title,
        content: dto.content,
        tags,
        status: dto.status ?? PostStatus.DRAFT,
        author: new Types.ObjectId(authorId),
      });

      return toPostResponse(post);
    } catch (err) {
      throw this.mapDbError(err);
    }
  }

  // BLG-02: Paginated list of published posts.
  async listPublished(query: ListPostsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const filter: Record<string, any> = {
      status: PostStatus.PUBLISHED,
      isHidden: false,
    };

    if (query.tag) {
      filter.tags = query.tag.trim().toLowerCase();
    }

    const [items, total] = await Promise.all([
      this.postModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      this.postModel.countDocuments(filter),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // BLG-02 + BLG-05: Get one published post and its comments.
  async getPublishedById(id: string) {
    if (!isValidObjectId(id)) {
      throw new NotFoundException('Post not found');
    }

    const post = await this.postModel
      .findOne({
        _id: id,
        status: PostStatus.PUBLISHED,
        isHidden: false,
      })
      .lean();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const comments = await this.commentModel
      .find({
        post: post._id,
        isHidden: false,
      })
      .sort({ createdAt: 1 })
      .lean();

    return {
      ...post,
      comments,
    };
  }

  // BLG-03: List the authenticated user's own posts.
  async listMine(
    authorId: string,
    query: ListPostsQueryDto,
  ) {
    this.requireUser(authorId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const filter = {
      author: new Types.ObjectId(authorId),
    };

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

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // Find a post and verify that the caller owns it.
  private async getOwnedPost(userId: string, id: string) {
    this.requireUser(userId);

    if (!isValidObjectId(id)) {
      throw new NotFoundException('Post not found');
    }

    const post = await this.postModel.findById(id);

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.author.toString() !== userId) {
      throw new ForbiddenException(
        'You can only change your own posts',
      );
    }

    return post;
  }

  // BLG-04 + BLG-08: Update an authenticated user's own post.
  async updatePost(
    userId: string,
    id: string,
    dto: UpdatePostDto,
  ) {
    const post = await this.getOwnedPost(userId, id);

    if (dto.title !== undefined) {
      post.title = dto.title;
    }

    if (dto.content !== undefined) {
      post.content = dto.content;
    }

    if (dto.tags !== undefined) {
      const tags = this.normalizeTags(dto.tags);
      this.validateTags(tags);
      post.tags = tags;
    }

    if (dto.status !== undefined) {
      post.status = dto.status;
    }

    try {
      return await post.save();
    } catch (err) {
      throw this.mapDbError(err);
    }
  }

  // BLG-04: Delete an owned post and its comments and likes.
  async deletePost(userId: string, id: string) {
    const post = await this.getOwnedPost(userId, id);

    await Promise.all([
      this.commentModel.deleteMany({ post: post._id }),
      this.likeModel.deleteMany({ post: post._id }),
    ]);

    await post.deleteOne();

    return {
      message: 'Post deleted',
    };
  }

  // BLG-05: Add a comment to a published post.
  async addComment(
    userId: string,
    postId: string,
    dto: CreateCommentDto,
  ) {
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

  // BLG-06: Like a published post once.
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
        throw new ConflictException(
          'You already liked this post',
        );
      }

      throw err;
    }

    const updated = await this.postModel
      .findByIdAndUpdate(
        post._id,
        { $inc: { likesCount: 1 } },
        { new: true },
      )
      .select('likesCount')
      .lean();

    return {
      liked: true,
      likesCount: updated?.likesCount ?? 0,
    };
  }

  // BLG-06: Remove the authenticated user's like.
  async unlikePost(userId: string, postId: string) {
    this.requireUser(userId);

    const post = await this.getVisiblePost(postId);

    const result = await this.likeModel.deleteOne({
      post: post._id,
      user: new Types.ObjectId(userId),
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException(
        'You have not liked this post',
      );
    }

    const updated = await this.postModel
      .findByIdAndUpdate(
        post._id,
        { $inc: { likesCount: -1 } },
        { new: true },
      )
      .select('likesCount')
      .lean();

    return {
      liked: false,
      likesCount: Math.max(updated?.likesCount ?? 0, 0),
    };
  }

  // Find a comment and verify that the caller wrote it.
  private async getOwnedComment(
    userId: string,
    id: string,
  ) {
    this.requireUser(userId);

    if (!isValidObjectId(id)) {
      throw new NotFoundException('Comment not found');
    }

    const comment = await this.commentModel.findById(id);

    if (!comment || comment.isHidden) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.author.toString() !== userId) {
      throw new ForbiddenException(
        'You can only change your own comments',
      );
    }

    return comment;
  }

  // BLG-07: Edit the authenticated user's own comment.
  async updateComment(
    userId: string,
    id: string,
    dto: UpdateCommentDto,
  ) {
    const comment = await this.getOwnedComment(userId, id);

    comment.text = dto.text;

    return comment.save();
  }

  // BLG-07: Delete an owned comment and update the count.
  async deleteComment(userId: string, id: string) {
    const comment = await this.getOwnedComment(userId, id);

    await comment.deleteOne();

    await this.postModel.updateOne(
      {
        _id: comment.post,
        commentsCount: { $gt: 0 },
      },
      {
        $inc: { commentsCount: -1 },
      },
    );

    return {
      message: 'Comment deleted',
    };
  }

  // BLG-08: Return published posts belonging to a tag.
  async listByTag(
    tag: string,
    query: ListPostsQueryDto,
  ) {
    const normalizedTag =
      typeof tag === 'string'
        ? tag.trim().toLowerCase()
        : '';

    if (
      normalizedTag.length < 1 ||
      normalizedTag.length > 30
    ) {
      throw new BadRequestException(
        'Tag must contain between 1 and 30 characters',
      );
    }

    return this.listPublished({
      ...query,
      tag: normalizedTag,
    });
  }

  // BLG-08: Search tags and count their published posts.
  async listTags(query: ListTagsQueryDto) {
    const limit = query.limit ?? 20;

    const pipeline: any[] = [
      {
        $match: {
          status: PostStatus.PUBLISHED,
          isHidden: false,
        },
      },
      {
        $unwind: '$tags',
      },
    ];

    if (query.search) {
      const term = query.search
        .trim()
        .toLowerCase()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      pipeline.push({
        $match: {
          tags: { $regex: term },
        },
      });
    }

    pipeline.push(
      {
        $group: {
          _id: '$tags',
          postsCount: { $sum: 1 },
        },
      },
      {
        $sort: {
          postsCount: -1,
          _id: 1,
        },
      },
      {
        $limit: limit,
      },
      {
        $project: {
          _id: 0,
          tag: '$_id',
          postsCount: 1,
        },
      },
    );

    return this.postModel.aggregate(pipeline);
  }
}

