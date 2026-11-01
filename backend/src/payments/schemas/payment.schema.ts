import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BookingType, PaymentStatus } from '../enums/payment.enums';

export type PaymentDocument = HydratedDocument<Payment>;

@Schema({ timestamps: true })
export class Payment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: BookingType, required: true })
  bookingType: BookingType;

  @Prop({
    type: Types.ObjectId,
    required: true,
    refPath: 'bookingModel',
    index: true,
  })
  bookingId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: ['FlightBooking', 'HotelBooking'],
  })
  bookingModel: string;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true, uppercase: true, default: 'USD' })
  currency: string;

  @Prop({
    type: String,
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
    index: true,
  })
  status: PaymentStatus;

  @Prop({ unique: true, sparse: true })
  stripePaymentIntentId?: string;

  @Prop()
  transactionId?: string;

  @Prop()
  failureReason?: string;

  @Prop({ default: 0 })
  retryCount: number;

  @Prop()
  paidAt?: Date;

  @Prop()
  expiresAt?: Date;

  @Prop({ type: Object })
  policySnapshot?: Record<string, any>;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
PaymentSchema.index({ bookingType: 1, bookingId: 1 });