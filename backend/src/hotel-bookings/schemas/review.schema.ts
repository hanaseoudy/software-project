import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';

export type ReviewDocument = HydratedDocument<Review>;

@Schema({ timestamps: true })
export class Review {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  user!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Hotel', required: true })
  hotel!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'HotelBooking', required: true, unique: true })
  booking!: Types.ObjectId;

  // HTL-23: a whole number from 1 to 5
  @Prop({
    required: true,
    min: 1,
    max: 5,
    validate: { validator: Number.isInteger, message: 'Rating must be a whole number from 1 to 5' },
  })
  rating!: number;

  @Prop({ trim: true, maxlength: 1000 })
  comment?: string;

  @Prop({ default: false })
  hidden!: boolean;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);