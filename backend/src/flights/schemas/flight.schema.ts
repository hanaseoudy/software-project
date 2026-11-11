import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CabinClass } from './airline.schema';
import { PLATFORM_CURRENCY } from '../../common/constants/currency.constants';

export type FlightDocument = HydratedDocument<Flight>;

export enum FlightStatus {
  SCHEDULED = 'SCHEDULED',
  CANCELLED = 'CANCELLED',
  DEPARTED = 'DEPARTED',
}

// One "section" of the plane. Needs an _id so PATCH /flights/:id/cabins/:cabinId works.
@Schema()
export class Cabin {
  @Prop({ required: true, enum: CabinClass })
  cabinClass: CabinClass;

  @Prop({ required: true, min: 1 })
  totalSeats: number;

  @Prop({ default: 0, min: 0 })
  bookedSeats: number; // paid, confirmed

  @Prop({ default: 0, min: 0 })
  heldSeats: number; // in a 10-minute pending hold

  @Prop({ required: true, min: 0.01 })
  price: number; // adult/child fare in USD (platform currency, PAY-04); infants pay 10% (calculated at booking)

  @Prop({ required: true, default: PLATFORM_CURRENCY, enum: [PLATFORM_CURRENCY] })
  currency: string; // PAY-04: always USD

  @Prop({ required: true, min: 0 })
  freeBags: number;

  @Prop({ required: true, min: 0 })
  maxBagWeightKg: number; // also applies to extra bags (FLT-08)
}
export const CabinSchema = SchemaFactory.createForClass(Cabin);

@Schema({ timestamps: true })
export class Flight {
  @Prop({ type: Types.ObjectId, ref: 'Airline', required: true, index: true })
  airline: Types.ObjectId;

  @Prop({ required: true, uppercase: true, trim: true })
  flightNumber: string; // e.g. "MS777"

  @Prop({ type: Types.ObjectId, ref: 'Airport', required: true })
  departureAirport: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Airport', required: true })
  arrivalAirport: Types.ObjectId;

  // Stored in UTC; convert using the airport's timezone when displaying
  @Prop({ required: true })
  departureTime: Date;

  @Prop({ required: true })
  arrivalTime: Date;

  @Prop({ required: true })
  departureLocalDate: string; // "2026-12-05", date at the departure airport

  @Prop({ required: true, min: 1 })
  durationMinutes: number;

  @Prop({ required: true, enum: FlightStatus, default: FlightStatus.SCHEDULED })
  status: FlightStatus;

  @Prop({ type: [CabinSchema], default: [] })
  cabins: Cabin[];
}

export const FlightSchema = SchemaFactory.createForClass(Flight);

FlightSchema.index({ departureAirport: 1, arrivalAirport: 1, departureLocalDate: 1 });
FlightSchema.index({ airline: 1, flightNumber: 1, departureLocalDate: 1 }, { unique: true });

FlightSchema.pre('validate', function () {
  if (this.departureAirport.equals(this.arrivalAirport)) {
    throw new Error('Departure and arrival airports must be different');
  }
  if (this.arrivalTime <= this.departureTime) {
    throw new Error('arrivalTime must be after departureTime');
  }
  const classes = this.cabins.map((c) => c.cabinClass);
  if (new Set(classes).size !== classes.length) {
    throw new Error('Each cabin class can be used only once per flight');
  }
  this.durationMinutes = Math.round(
    (this.arrivalTime.getTime() - this.departureTime.getTime()) / 60000,
  );
});