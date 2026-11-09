import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { Post, PostDocument, PostStatus } from './schemas/post.schema';
import { CreatePostDto } from './dto/create-post.dto';
import { PostResponseDto, toPostResponse } from './dto/post-response.dto';
import { MAX_POST_IMAGES, PostImagesService } from './post-images.service';
import type { UploadedPostImage } from './post-images.service';

@Injectable()
export class BlogService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<PostDocument>,
    private readonly postImages: PostImagesService,
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
    files: UploadedPostImage[] = [],
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

    const urls = await this.postImages.save(files);
    try {
      const post = await this.postModel.create({
        title: dto.title,
        content: dto.content,
        tags,
        status: dto.status ?? PostStatus.DRAFT,
        author: new Types.ObjectId(authorId),
        images: urls.map((url) => ({ url })),
      });
      return toPostResponse(post);
    } catch (err) {
      await this.postImages.remove(urls);
      throw this.mapDbError(err);
    }
  }

  private async ownedPost(
    authorId: string,
    postId: string,
  ): Promise<PostDocument> {
    if (!isValidObjectId(authorId))
      throw new UnauthorizedException('Login required');
    if (!isValidObjectId(postId)) throw new NotFoundException('Post not found');
    const post = await this.postModel.findById(postId).exec();
    if (!post) throw new NotFoundException('Post not found');
    if (String(post.author) !== authorId) {
      throw new ForbiddenException('Only the author can change post images');
    }
    return post;
  }

  async addImages(
    authorId: string,
    postId: string,
    files: UploadedPostImage[],
  ) {
    const post = await this.ownedPost(authorId, postId);
    if (!files.length || post.images.length + files.length > MAX_POST_IMAGES) {
      throw new BadRequestException(
        'Upload between 1 and 5 images; a post can have at most 5',
      );
    }
    const urls = await this.postImages.save(files);
    let updated: PostDocument | null;
    try {
      // The count condition and append are one atomic operation, including concurrent uploads.
      updated = await this.postModel
        .findOneAndUpdate(
          {
            _id: post._id,
            author: new Types.ObjectId(authorId),
            $expr: {
              $lte: [
                { $size: { $ifNull: ['$images', []] } },
                MAX_POST_IMAGES - files.length,
              ],
            },
          },
          { $push: { images: { $each: urls.map((url) => ({ url })) } } },
          { returnDocument: 'after', runValidators: true },
        )
        .exec();
    } catch (error) {
      await this.postImages.remove(urls);
      throw this.mapDbError(error);
    }
    if (!updated) {
      await this.postImages.remove(urls);
      throw new BadRequestException(
        'Post changed or its image limit was reached; reload and try again',
      );
    }
    return toPostResponse(updated);
  }

  async removeImage(authorId: string, postId: string, filename: string) {
    const post = await this.ownedPost(authorId, postId);
    const url = this.postImages.url(filename);
    const updated = await this.postModel
      .findOneAndUpdate(
        {
          _id: post._id,
          author: new Types.ObjectId(authorId),
          'images.url': url,
        },
        { $pull: { images: { url } } },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
    if (!updated) throw new NotFoundException('Image not found on this post');
    await this.postImages.remove([url]);
    return toPostResponse(updated);
  }

  async readImage(filename: string, viewerId?: string) {
    const url = this.postImages.url(filename);
    const post = await this.postModel.findOne({ 'images.url': url }).exec();
    if (
      !post ||
      ((post.status !== PostStatus.PUBLISHED || post.isHidden) &&
        (!viewerId || String(post.author) !== viewerId))
    ) {
      throw new NotFoundException('Image not found');
    }
    return this.postImages.read(filename);
  }
}
