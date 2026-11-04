import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AirportDocument = HydratedDocument<Airport>;

@Schema({ timestamps: true })
export class Airport {
  @Prop({ required: true, unique: true, uppercase: true, minlength: 3, maxlength: 3 })
  iataCode: string; // e.g. "CAI"

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  city: string;

  @Prop({ required: true })
  country: string;

  @Prop({ required: true })
  timezone: string; // IANA name, e.g. "Africa/Cairo"
}

export const AirportSchema = SchemaFactory.createForClass(Airport);