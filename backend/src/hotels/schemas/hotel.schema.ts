import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';
import { integerValidator, timeRegex } from './validators';

export type HotelDocument = HydratedDocument<Hotel>;

@Schema({ _id: false })
export class CancellationTier {
  @Prop({ required: true, min: 0, validate: integerValidator })
  daysBeforeCheckIn: number;

  @Prop({ required: true, min: 0, max: 100 })
  refundPercentage: number;
}
export const CancellationTierSchema =
  SchemaFactory.createForClass(CancellationTier);

@Schema({ _id: false })
export class HotelPolicy {
  @Prop({ type: [CancellationTierSchema], default: [] })
  cancellationTiers: CancellationTier[];
}
export const HotelPolicySchema = SchemaFactory.createForClass(HotelPolicy);

@Schema({ timestamps: true })
export class Hotel {
  @Prop({ required: true, trim: true, minlength: 2, maxlength: 150 })
  name: string;

  @Prop({ trim: true, maxlength: 3000, default: '' })
  description: string;

  @Prop({ required: true, trim: true })
  address: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'City', required: true, index: true })
  city: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Country', required: true, index: true })
  country: Types.ObjectId;

  @Prop({ required: true, min: 1, max: 5, validate: integerValidator })
  starRating: number;

  @Prop({ type: [String], default: [] })
  amenities: string[];

  @Prop({
    type: [String],
    default: [],
    validate: [
      (v: string[]) => v.length <= 5,
      'A hotel can have at most 5 images',
    ],
  })
  images: string[];

  @Prop({ required: true, default: '14:00', match: timeRegex })
  checkInTime: string;

  @Prop({ required: true, default: '12:00', match: timeRegex })
  checkOutTime: string;

  @Prop({ type: HotelPolicySchema, default: () => ({}) })
  policies: HotelPolicy;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', unique: true, sparse: true })
  moderator?: Types.ObjectId;

  @Prop({ default: 0, min: 0, max: 5 })
  averageRating: number;

  @Prop({ default: 0, min: 0 })
  reviewCount: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const HotelSchema = SchemaFactory.createForClass(Hotel);

HotelSchema.index({ city: 1, isActive: 1 });
HotelSchema.index({ country: 1, isActive: 1 });
HotelSchema.index({ name: 'text' });