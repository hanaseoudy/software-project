import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CabinClass } from './airline.schema';

export type FlightDocument = HydratedDocument<Flight>;

export enum FlightStatus {
  SCHEDULED = 'scheduled',
  CANCELLED = 'cancelled',
}

// Price per passenger type for one cabin
@Schema({ _id: false })
export class CabinPrice {
  @Prop({ required: true, min: 0 })
  adult: number;

  @Prop({ required: true, min: 0 })
  child: number;

  @Prop({ required: true, min: 0 })
  infant: number;
}
export const CabinPriceSchema = SchemaFactory.createForClass(CabinPrice);

// One "section" of the plane. Needs an _id so PATCH /flights/:id/cabins/:cabinId works.
@Schema()
export class Cabin {
  @Prop({ required: true, enum: CabinClass })
  cabinClass: CabinClass;

  @Prop({ required: true, min: 1 })
  totalSeats: number;

  @Prop({ required: true, min: 0 })
  availableSeats: number;

  @Prop({ type: CabinPriceSchema, required: true })
  price: CabinPrice;
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

  @Prop({ required: true, enum: FlightStatus, default: FlightStatus.SCHEDULED })
  status: FlightStatus;

  @Prop({ type: [CabinSchema], default: [] })
  cabins: Cabin[];
}

export const FlightSchema = SchemaFactory.createForClass(Flight);

// Speeds up the search endpoint (route + date)
FlightSchema.index({ departureAirport: 1, arrivalAirport: 1, departureTime: 1 });

// The same airline can't reuse a flight number at the same departure time
FlightSchema.index({ airline: 1, flightNumber: 1, departureTime: 1 }, { unique: true });

// Arrival must be after departure
FlightSchema.pre('validate', function () {
  if (this.arrivalTime <= this.departureTime) {
    throw new Error('arrivalTime must be after departureTime');
  }
});