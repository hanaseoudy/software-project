import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreatePostDto } from './dto/create-post.dto';
import { PostResponseDto } from './dto/post-response.dto';
import { Post, PostDocument, PostStatus } from './schemas/post.schema';

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