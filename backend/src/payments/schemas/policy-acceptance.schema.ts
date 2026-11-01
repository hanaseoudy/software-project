import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BookingType } from '../enums/payment.enums';

export type PolicyAcceptanceDocument = HydratedDocument<PolicyAcceptance>;

@Schema({ timestamps: true })
export class PolicyAcceptance {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: BookingType, required: true })
  bookingType: BookingType;

  @Prop({ type: Types.ObjectId, required: true })
  bookingId: Types.ObjectId;

  @Prop({ type: Object, required: true })
  acceptedPolicies: Record<string, any>;

  @Prop({ required: true, default: () => new Date() })
  acceptedAt: Date;
}

export const PolicyAcceptanceSchema =
  SchemaFactory.createForClass(PolicyAcceptance);
PolicyAcceptanceSchema.index({ bookingType: 1, bookingId: 1 });