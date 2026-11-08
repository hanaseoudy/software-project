import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';

export type ItineraryDocument = HydratedDocument<Itinerary>;

export enum ItineraryVisibility {
  PRIVATE = 'PRIVATE',
  PUBLIC = 'PUBLIC',
}

@Schema({ timestamps: true })
export class Itinerary {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, maxlength: 100 })
  title: string;

  // Values must be checked against the seeded country list by the service.
  @Prop({ type: [String], required: true, validate: [(v: string[]) => v.length > 0, 'At least one country is required'] })
  countryIds: string[];

  @Prop({ type: Date, required: true })
  startDate: Date;

  @Prop({ type: String, enum: ItineraryVisibility, default: ItineraryVisibility.PRIVATE, index: true })
  visibility: ItineraryVisibility;

  // Optional source link; clone must not depend on the original remaining available.
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Itinerary' })
  clonedFromId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  originalAuthorId?: Types.ObjectId;

  // Snapshot keeps attribution available if the source itinerary/user changes.
  @Prop({ type: String, trim: true })
  originalAuthorName?: string;
}

export const ItinerarySchema = SchemaFactory.createForClass(Itinerary);
ItinerarySchema.index({ visibility: 1, updatedAt: -1 });
ItinerarySchema.index({ userId: 1, updatedAt: -1 });
ItinerarySchema.index({ title: 'text', countryIds: 'text' });
