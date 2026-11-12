import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { CreatePostDto } from './dto/create-post.dto';
import { MyPostsPage } from './dto/my-post-response.dto';
import { PostResponseDto } from './dto/post-response.dto';
import { Post, PostDocument, PostStatus } from './schemas/post.schema';
import { PAGE_SIZE, paginate, skipFor } from '../common/pagination/pagination';

@Injectable()
export class BlogService {
  constructor(@InjectModel(Post.name) private readonly postModel: Model<PostDocument>) {}

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