import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Post, PostDocument, PostStatus } from './schemas/post.schema';
import { CreatePostDto } from './dto/create-post.dto';

@Injectable()
export class BlogService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<PostDocument>,
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
}