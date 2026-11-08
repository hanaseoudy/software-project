import { PLATFORM_CURRENCY } from '../../common/constants/currency.constants';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BookedRoom, BookedRoomSchema } from './booked-room.schema';

export enum HotelBookingStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export type HotelBookingDocument = HydratedDocument<HotelBooking>;

@Schema({ timestamps: true })
export class HotelBooking {
  @Prop({ unique: true, sparse: true })
  bookingReference?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Hotel', required: true })
  hotel!: Types.ObjectId;

  @Prop({ type: [BookedRoomSchema], required: true })
  rooms!: BookedRoom[];

  @Prop({ required: true })
  checkIn!: Date;

  @Prop({ required: true })
  checkOut!: Date;

  @Prop({ required: true, min: 0 })
  totalPrice!: number;

  @Prop({
    type: String,
    required: true,
    uppercase: true,
    default: PLATFORM_CURRENCY,
    enum: [PLATFORM_CURRENCY],
    immutable: true,
  })
  currency!: string;

  @Prop({ type: String, enum: HotelBookingStatus, default: HotelBookingStatus.PENDING_PAYMENT })
  status!: HotelBookingStatus;

  @Prop()
  holdExpiresAt?: Date;

  @Prop()
  policiesAcceptedAt?: Date;
}

export const HotelBookingSchema = SchemaFactory.createForClass(HotelBooking);