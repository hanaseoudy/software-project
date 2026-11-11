import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';

export type CommentDocument = HydratedDocument<Comment>;

@Schema({ timestamps: true })
export class Comment {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Post', required: true, index: true })
  post: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  author: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 1000 })
  text: string;

  @Prop({ default: false })
  isHidden: boolean;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);