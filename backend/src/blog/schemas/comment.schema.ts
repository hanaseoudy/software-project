import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';
import { COMMENT_MAX_LENGTH } from '../comment-rules';

export type CommentDocument = HydratedDocument<Comment>;

@Schema({ timestamps: true })
export class Comment {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Post', required: true, index: true })
  post: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  author: Types.ObjectId;

  // BLG-05: enforced in the database as well as the DTO
  @Prop({ required: true, trim: true, minlength: 1, maxlength: COMMENT_MAX_LENGTH })
  text: string;

  @Prop({ default: false })
  isHidden: boolean;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);
// BLG-05: read a post's comments in chronological order (oldest first)
CommentSchema.index({ post: 1, createdAt: 1 });