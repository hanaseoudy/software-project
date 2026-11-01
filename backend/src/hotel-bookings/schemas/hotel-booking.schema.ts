import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum HotelBookingStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  COMPLETED = 'COMPLETED',
}

export enum HotelBookingPaymentStatus {
  UNPAID = 'UNPAID',
  PAID = 'PAID',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
}

@Schema({ _id: false })
export class BookedRoom {
  @Prop({ type: Types.ObjectId, ref: 'Room', required: true })
  room!: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  pricePerNight!: number;

  @Prop({ required: true, min: 1 })
  guests!: number;

  @Prop({ required: true, min: 0 })
  subtotal!: number;
}

export const BookedRoomSchema = SchemaFactory.createForClass(BookedRoom);

@Schema({ _id: false })
export class PolicyAcceptance {
  @Prop({ required: true })
  acceptedAt!: Date;

  @Prop({ type: Object, required: true })
  policySnapshot!: Record<string, unknown>;
}

export const PolicyAcceptanceSchema = SchemaFactory.createForClass(PolicyAcceptance);

export type HotelBookingDocument = HydratedDocument<HotelBooking>;

@Schema({ timestamps: true, collection: 'hotel_bookings' })
export class HotelBooking {
  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  bookingReference!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Hotel', required: true })
  hotel!: Types.ObjectId;

  @Prop({
    type: [BookedRoomSchema],
    required: true,
    validate: [(v: BookedRoom[]) => v.length > 0, 'At least one room is required'],
  })
  rooms!: BookedRoom[];

  @Prop({ required: true })
  checkIn!: Date;

  @Prop({ required: true })
  checkOut!: Date;

  @Prop({ required: true, min: 1 })
  nights!: number;

  @Prop({ required: true, min: 1 })
  totalGuests!: number;

  @Prop({ required: true, min: 0 })
  totalPrice!: number;

  @Prop({ required: true, uppercase: true, minlength: 3, maxlength: 3 })
  currency!: string;

  @Prop({ type: String, enum: HotelBookingStatus, default: HotelBookingStatus.PENDING })
  status!: HotelBookingStatus;

  @Prop({ type: String, enum: HotelBookingPaymentStatus, default: HotelBookingPaymentStatus.UNPAID })
  paymentStatus!: HotelBookingPaymentStatus;

  @Prop({ type: PolicyAcceptanceSchema })
  policyAcceptance?: PolicyAcceptance;

  @Prop({ type: Types.ObjectId, ref: 'Payment' })
  payment?: Types.ObjectId;

  @Prop()
  holdExpiresAt?: Date;

  @Prop()
  confirmedAt?: Date;

  @Prop()
  cancelledAt?: Date;

  @Prop({ trim: true, maxlength: 500 })
  cancellationReason?: string;

  @Prop({ min: 0 })
  refundAmount?: number;

  @Prop({ type: Types.ObjectId, ref: 'Refund' })
  refund?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Review' })
  review?: Types.ObjectId;
}

export const HotelBookingSchema = SchemaFactory.createForClass(HotelBooking);

HotelBookingSchema.pre('validate', function () {
  if (this.checkIn && this.checkOut && this.checkOut <= this.checkIn) {
    this.invalidate('checkOut', 'checkOut must be after checkIn');
  }
});

HotelBookingSchema.index({ 'rooms.room': 1, checkIn: 1, checkOut: 1, status: 1 });
HotelBookingSchema.index({ user: 1, createdAt: -1 });
HotelBookingSchema.index({ hotel: 1, checkIn: 1 });
HotelBookingSchema.index({ status: 1, holdExpiresAt: 1 });