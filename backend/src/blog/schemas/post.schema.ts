import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';
import { MAX_TAG_LENGTH, MAX_TAGS } from '../tag-rules';

export type PostDocument = HydratedDocument<Post>;

export enum PostStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

@Schema({ timestamps: true })
export class Post {
  @Prop({ required: true, trim: true, maxlength: 200 })
  title: string;

  @Prop({ required: true })
  content: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  author: Types.ObjectId;

  @Prop({ enum: PostStatus, default: PostStatus.DRAFT, index: true })
  status: PostStatus;

  // BLG-08: database-level tag rules, so they hold even if the DTO is bypassed
  @Prop({
    type: [String],
    default: [],
    index: true,
    validate: [
      {
        validator: (tags: unknown[]) => tags.length <= MAX_TAGS,
        message: `A post can have at most ${MAX_TAGS} tags`,
      },
      {
        validator: (tags: unknown[]) =>
          tags.every((tag) => typeof tag === 'string' && tag.trim().length >= 1 && tag.length <= MAX_TAG_LENGTH),
        message: `Each tag must be 1 to ${MAX_TAG_LENGTH} characters`,
      },
      {
        validator: (tags: unknown[]) => new Set(tags).size === tags.length,
        message: 'Tags must be unique',
      },
    ],
  })
  tags: string[];

  @Prop({ type: [{ url: { type: String, required: true } }], default: [] })
  images: { _id?: Types.ObjectId; url: string }[];

  @Prop({ default: false })
  isHidden: boolean;

  @Prop({ default: 0 })
  likesCount: number;

  @Prop({ default: 0 })
  commentsCount: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Itinerary', default: null })
  itinerary?: Types.ObjectId | null;
}

export const PostSchema = SchemaFactory.createForClass(Post);
PostSchema.index({ title: 'text', content: 'text', tags: 'text' });