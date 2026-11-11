import { PLATFORM_CURRENCY } from '../../common/constants/currency.constants';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';
import { Passenger, PassengerSchema } from './passenger.schema';

export enum FlightBookingStatus {
  HELD = 'HELD',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum CabinClass {
  ECONOMY = 'ECONOMY',
  PREMIUM_ECONOMY = 'PREMIUM_ECONOMY',
  BUSINESS = 'BUSINESS',
  FIRST = 'FIRST',
}

@Schema({ timestamps: true })
export class FlightBooking extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Flight', required: true })
  outboundFlight: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Flight' })
  returnFlight?: Types.ObjectId;

  @Prop({ required: true, enum: ['ONE_WAY', 'ROUND_TRIP'] })
  tripType: string;

  @Prop({ required: true, enum: CabinClass })
  cabinClass: CabinClass;

  @Prop({ type: [PassengerSchema], validate: (v: any[]) => v.length > 0 })
  passengers: Passenger[];

  @Prop({ required: true, min: 0 })
  totalPrice: number;

  @Prop({
    type: String,
    required: true,
    uppercase: true,
    default: PLATFORM_CURRENCY,
    enum: [PLATFORM_CURRENCY],
    immutable: true,
  })
  currency: string;

  @Prop({ default: 0, min: 0 })
  baggageFees: number;

  @Prop({ unique: true, sparse: true })
  bookingReference?: string;

  @Prop({
    required: true,
    enum: FlightBookingStatus,
    default: FlightBookingStatus.HELD,
    index: true,
  })
  status: FlightBookingStatus;

  @Prop()
  holdExpiresAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Payment' })
  payment?: Types.ObjectId;

  @Prop()
  policiesAcceptedAt?: Date;

  @Prop()
  eTicketNumber?: string;

  @Prop()
  cancelledAt?: Date;

  @Prop()
  cancellationReason?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Refund' })
  refund?: Types.ObjectId;
}

export const FlightBookingSchema = SchemaFactory.createForClass(FlightBooking);

FlightBookingSchema.index({ status: 1, holdExpiresAt: 1 });