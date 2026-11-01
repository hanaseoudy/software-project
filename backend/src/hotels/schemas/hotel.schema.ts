import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type HotelDocument = HydratedDocument<Hotel>;

@Schema({ _id: false })
export class CancellationRule {
  @Prop({ required: true, min: 0 })
  hoursBeforeCheckIn: number;

  @Prop({ required: true, min: 0, max: 100 })
  refundPercentage: number;
}
export const CancellationRuleSchema =
  SchemaFactory.createForClass(CancellationRule);

@Schema({ _id: false })
export class HotelPolicy {
  @Prop({ type: [CancellationRuleSchema], default: [] })
  cancellationRules: CancellationRule[];

  @Prop({ trim: true, default: '' })
  houseRules: string;
}
export const HotelPolicySchema = SchemaFactory.createForClass(HotelPolicy);

@Schema({ timestamps: true })
export class Hotel {
  @Prop({ required: true, trim: true, minlength: 2, maxlength: 150 })
  name: string;

  @Prop({ trim: true, maxlength: 3000, default: '' })
  description: string;

  @Prop({ type: Types.ObjectId, ref: 'City', required: true, index: true })
  city: Types.ObjectId;

  @Prop({ required: true, trim: true })
  address: string;

  @Prop({ min: 1, max: 5, required: true })
  starRating: number;

  @Prop({ type: [String], default: [] })
  amenities: string[];

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({
    required: true,
    default: '14:00',
    match: /^([01]\d|2[0-3]):[0-5]\d$/,
  })
  checkInTime: string;

  @Prop({
    required: true,
    default: '12:00',
    match: /^([01]\d|2[0-3]):[0-5]\d$/,
  })
  checkOutTime: string;

  @Prop({ type: HotelPolicySchema, default: () => ({}) })
  policies: HotelPolicy;

  @Prop({ type: Types.ObjectId, ref: 'User', unique: true, sparse: true })
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
HotelSchema.index({ name: 'text' });