import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BookingType, RefundStatus } from '../enums/payment.enums';

export type RefundDocument = HydratedDocument<Refund>;

@Schema({ timestamps: true })
export class Refund {
  @Prop({ type: Types.ObjectId, ref: 'Payment', required: true, index: true })
  paymentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: BookingType, required: true })
  bookingType: BookingType;

  @Prop({ type: Types.ObjectId, required: true })
  bookingId: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true, uppercase: true })
  currency: string;

  @Prop({
    type: String,
    enum: RefundStatus,
    default: RefundStatus.PENDING,
  })
  status: RefundStatus;

  @Prop()
  stripeRefundId?: string;

  @Prop()
  reason?: string;

  @Prop({ type: Object })
  appliedPolicy?: Record<string, any>;

  @Prop()
  processedAt?: Date;
}

export const RefundSchema = SchemaFactory.createForClass(Refund);