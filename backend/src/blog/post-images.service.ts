import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { ImageCategory, MAX_IMAGES } from '../uploads/uploads.constants';
import { UploadedImage, UploadsService } from '../uploads/uploads.service';
import { PostResponseDto } from './dto/post-response.dto';
import { attachImagesFilter, toPostResponse } from './post-images.helpers';
import { Post, PostDocument } from './schemas/post.schema';

// BLG-10: attach / remove post images using the shared GEN-08 upload rules (UploadsService).
@Injectable()
export class PostImagesService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<PostDocument>,
    private readonly uploads: UploadsService,
  ) {}

  // 404 if the post does not exist, 403 if the caller is not its author
  private async getOwnedPost(userId: string, postId: string): Promise<PostDocument> {
    if (!isValidObjectId(postId)) throw new NotFoundException('Post not found');
    const post = await this.postModel.findById(postId);
    if (!post) throw new NotFoundException('Post not found');
    if (post.author.toString() !== userId) {
      throw new ForbiddenException('You can only change images of your own posts');
    }
    return post;
  }

  async attach(userId: string, postId: string, files: UploadedImage[] | undefined): Promise<PostResponseDto> {
    const post = await this.getOwnedPost(userId, postId);

    // GEN-08: checks count (max 5 per post incl. existing), type, size and content, then stores the files
    const urls = await this.uploads.saveForOwner(
      files,
      ImageCategory.POST,
      post.images.map((image) => image.url),
    );

    const max = MAX_IMAGES[ImageCategory.POST];
    const updated = await this.postModel.findOneAndUpdate(
      attachImagesFilter(postId, userId, max, urls.length),
      { $push: { images: { $each: urls.map((url) => ({ url })) } } },
      { returnDocument: 'after' },
    );
    if (!updated) {
      // another upload filled the post in the meantime: remove the files we just stored
      await Promise.all(urls.map((url) => this.uploads.deleteByUrl(url)));
      throw new BadRequestException(`A post can have at most ${max} images`);
    }
    return toPostResponse(updated);
  }

  async remove(userId: string, postId: string, imageId: string): Promise<PostResponseDto> {
    const post = await this.getOwnedPost(userId, postId);
    const image = isValidObjectId(imageId)
      ? post.images.find((img) => String(img._id) === imageId)
      : undefined;
    if (!image) throw new NotFoundException('Image not found');

    const updated = await this.postModel.findOneAndUpdate(
      { _id: postId, author: userId, 'images._id': imageId },
      { $pull: { images: { _id: imageId } } },
      { returnDocument: 'after' },
    );
    if (!updated) throw new NotFoundException('Image not found');

    // remove the stored file only after the post no longer points to it
    if (this.uploads.isStoredUrl(ImageCategory.POST, image.url)) {
      await this.uploads.deleteByUrl(image.url);
    }
    return toPostResponse(updated);
  }
}
