import { PLATFORM_CURRENCY } from '../../common/constants/currency.constants';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';
import { BookingType, PaymentStatus } from '../enums/payment.enums';

export type PaymentDocument = HydratedDocument<Payment>;

@Schema({ timestamps: true })
export class Payment {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: BookingType, required: true })
  bookingType: BookingType;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
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

  @Prop({
    type: String,
    required: true,
    uppercase: true,
    default: PLATFORM_CURRENCY,
    enum: [PLATFORM_CURRENCY],
    immutable: true,
  })
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

  @Prop({
    default: 0,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: 'retryCount must be an integer',
    },
  })
  retryCount: number;

  @Prop()
  paidAt?: Date;

  @Prop()
  expiresAt?: Date;

  @Prop({ type: Object })
  policySnapshot?: Record<string, any>;

  /** PAY-03: set atomically while a refund is Pending or Refunded, so a payment is never refunded twice. */
  @Prop({ default: false })
  refundInProgress?: boolean;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
PaymentSchema.index({ bookingType: 1, bookingId: 1 });