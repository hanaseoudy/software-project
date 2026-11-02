import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ItineraryDocument = HydratedDocument<Itinerary>;

export enum ItineraryVisibility {
  PRIVATE = 'PRIVATE',
  PUBLIC = 'PUBLIC',
}

@Schema({ timestamps: true })
export class Itinerary {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  title: string;

  // Store a country identifier from the official reference dataset.
  @Prop({ type: String, required: true, trim: true })
  countryId: string;

  @Prop({ type: Date, required: true })
  startDate: Date;

  @Prop({ type: String, enum: ItineraryVisibility, default: ItineraryVisibility.PRIVATE, index: true })
  visibility: ItineraryVisibility;

  @Prop({ type: String, uppercase: true, default: 'USD', match: /^[A-Z]{3}$/ })
  displayCurrency: string;

  // Attribution is retained even if the original itinerary is later removed.
  @Prop({ type: Types.ObjectId, ref: 'Itinerary' })
  clonedFromId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  originalAuthorId?: Types.ObjectId;
}

export const ItinerarySchema = SchemaFactory.createForClass(Itinerary);
ItinerarySchema.index({ visibility: 1, title: 1 });
