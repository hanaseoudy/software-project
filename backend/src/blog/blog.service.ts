import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { Post, PostDocument, PostStatus } from './schemas/post.schema';
import { CreatePostDto } from './dto/create-post.dto';
import { PostResponseDto, toPostResponse } from './dto/post-response.dto';

@Injectable()
export class BlogService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<PostDocument>,
  ) {}

  // tolerant of bad input: ignores non-string tags, trims, lowercases, removes duplicates
  private normalizeTags(tags: unknown): string[] {
    if (!Array.isArray(tags)) return [];
    const clean = tags
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    return [...new Set(clean)];
  }

  // turns expected database errors into clear API errors
  private mapDbError(err: any) {
    if (err?.name === 'ValidationError' || err?.name === 'CastError') {
      return new BadRequestException(err.message);
    }
    return new InternalServerErrorException('Could not save the post');
  }

  // BLG-01: create a post as draft or published
  async createPost(
    authorId: string,
    dto: CreatePostDto,
  ): Promise<PostResponseDto> {
    if (!authorId || !isValidObjectId(authorId)) {
      throw new UnauthorizedException('Login required');
    }

    const tags = this.normalizeTags(dto.tags);
    if (tags.length > 5 || tags.some((t) => t.length > 30)) {
      throw new BadRequestException(
        'A post can have at most 5 tags of up to 30 characters each',
      );
    }

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
}
