import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum HotelBookingStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export type HotelBookingDocument = HydratedDocument<HotelBooking>;

@Schema({ timestamps: true })
export class HotelBooking {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Hotel', required: true })
  hotel!: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Room' }], required: true })
  rooms!: Types.ObjectId[];

  @Prop({ required: true })
  checkIn!: Date;

  @Prop({ required: true })
  checkOut!: Date;

  @Prop({ required: true, min: 1 })
  guests!: number;

  @Prop({ required: true, min: 0 })
  totalPrice!: number;

  @Prop({ type: String, enum: HotelBookingStatus, default: HotelBookingStatus.PENDING })
  status!: HotelBookingStatus;

  @Prop({ type: String, enum: PaymentStatus, default: PaymentStatus.PENDING })
  paymentStatus!: PaymentStatus;

  @Prop()
  policiesAcceptedAt?: Date;
}

export const HotelBookingSchema = SchemaFactory.createForClass(HotelBooking);