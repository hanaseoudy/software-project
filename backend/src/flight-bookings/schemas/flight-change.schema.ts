import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';

export type FlightChangeDocument = HydratedDocument<FlightChange>;

export enum FlightChangeStatus {
  /** Waiting for the user to pay the fare difference (new seats are held). */
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  COMPLETED = 'COMPLETED',
  /** The fare difference was not paid within the hold. */
  EXPIRED = 'EXPIRED',
  /** Paid, but the booking could not be changed any more (the payment is refunded). */
  FAILED = 'FAILED',
}

/**
 * FLT-27: one request to change the flight(s) of a confirmed booking.
 * The booking itself only changes when the request is COMPLETED.
 */
@Schema({ timestamps: true })
export class FlightChange {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'FlightBooking',
    required: true,
  })
  booking: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Flight', required: true })
  oldOutboundFlight: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Flight' })
  oldReturnFlight?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Flight', required: true })
  newOutboundFlight: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Flight' })
  newReturnFlight?: Types.ObjectId;

  @Prop({ required: true })
  cabinClass: string;

  /** Seats per leg (adults + children). */
  @Prop({ required: true, min: 1 })
  seats: number;

  @Prop({ required: true, min: 0 })
  oldAmount: number;

  @Prop({ required: true, min: 0 })
  newAmount: number;

  @Prop({ required: true, min: 0 })
  newTotalPrice: number;

  @Prop({ required: true, min: 0, default: 0 })
  newBaggageFees: number;

  /** newAmount - oldAmount: positive = user pays, negative = user is refunded. */
  @Prop({ required: true })
  difference: number;

  @Prop({
    type: String,
    enum: FlightChangeStatus,
    default: FlightChangeStatus.PENDING_PAYMENT,
  })
  status: FlightChangeStatus;

  @Prop({ unique: true, sparse: true })
  stripePaymentIntentId?: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  failureReason?: string;
}

export const FlightChangeSchema = SchemaFactory.createForClass(FlightChange);

// A booking can have only one change waiting for payment at a time. This is the
// only index on `booking`: do not add `index: true` to the field, it would define
// a second, non-unique index on the same key.
FlightChangeSchema.index(
  { booking: 1 },
  {
    unique: true,
    partialFilterExpression: { status: FlightChangeStatus.PENDING_PAYMENT },
  },
);
