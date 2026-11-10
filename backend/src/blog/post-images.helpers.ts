// BLG-10: pure helpers for attaching / removing post images (no Nest imports, so they can be unit tested).
import type { PostResponseDto } from './dto/post-response.dto';

export interface PostImageLike {
  _id?: { toString(): string } | string;
  url: string;
}

export interface PostLike {
  _id: { toString(): string } | string;
  title: string;
  content: string;
  status: string;
  tags?: string[];
  images?: PostImageLike[];
  author: { toString(): string } | string;
  likesCount?: number;
  commentsCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Atomic filter for adding `newCount` images: the post must still belong to the author and still have
 * room, i.e. there must be no image at index (max - newCount). This re-checks the GEN-08 limit inside the
 * update itself, so two uploads at the same time cannot go over the limit.
 */
export function attachImagesFilter(postId: string, authorId: string, max: number, newCount: number) {
  return {
    _id: postId,
    author: authorId,
    [`images.${max - newCount}`]: { $exists: false },
  };
}

// Same response shape as BLG-01's PostResponseDto (images as { id, url }).
export function toPostResponse(post: PostLike): PostResponseDto {
  return {
    id: String(post._id),
    title: post.title,
    content: post.content,
    status: post.status as PostResponseDto['status'],
    tags: post.tags ?? [],
    images: (post.images ?? []).map((image) => ({ id: String(image._id), url: image.url })),
    author: String(post.author),
    likesCount: post.likesCount ?? 0,
    commentsCount: post.commentsCount ?? 0,
    createdAt: post.createdAt as Date,
    updatedAt: post.updatedAt as Date,
  };
}
