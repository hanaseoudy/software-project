import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { Post, PostDocument, PostStatus } from './schemas/post.schema';
import { Comment, CommentDocument } from './schemas/comment.schema';
import { CreatePostDto } from './dto/create-post.dto';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';

@Injectable()
export class BlogService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<PostDocument>,
    @InjectModel(Comment.name)
    private readonly commentModel: Model<CommentDocument>,
  ) {}

  // BLG-01: create a post as draft or published
  async createPost(authorId: string, dto: CreatePostDto) {
    const tags = [
      ...new Set(
        (dto.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
      ),
    ];
    return this.postModel.create({
      title: dto.title,
      content: dto.content,
      tags,
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

  // BLG-02: one published post with its comments
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
}
