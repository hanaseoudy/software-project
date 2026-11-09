import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PostDocument = HydratedDocument<Post>;

export enum PostStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

@Schema({ timestamps: true })
export class Post {
  @Prop({ required: true, trim: true, minlength: 1, maxlength: 200 })
  title: string;

  @Prop({ required: true, trim: true, minlength: 1 })
  content: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  author: Types.ObjectId;

  @Prop({ enum: PostStatus, default: PostStatus.DRAFT, index: true })
  status: PostStatus;

  // BLG-08: database-level limits (max 5 tags, 1-30 characters each)
  @Prop({
    type: [String],
    default: [],
    index: true,
    validate: [
      {
        validator: (v: string[]) => v.length <= 5,
        message: 'A post can have at most 5 tags',
      },
      {
        validator: (v: string[]) =>
          v.every((t) => typeof t === 'string' && t.length >= 1 && t.length <= 30),
        message: 'Each tag must be 1 to 30 characters',
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

  @Prop({ type: Types.ObjectId, ref: 'Itinerary', default: null })
  itinerary?: Types.ObjectId | null;
}

export const PostSchema = SchemaFactory.createForClass(Post);
PostSchema.index({ title: 'text', content: 'text', tags: 'text' });
