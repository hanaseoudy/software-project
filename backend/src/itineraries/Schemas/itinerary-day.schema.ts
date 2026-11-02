import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ItineraryDayDocument = HydratedDocument<ItineraryDay>;

@Schema({ timestamps: true })
export class ItineraryDay {
  @Prop({ type: Types.ObjectId, ref: 'Itinerary', required: true, index: true })
  itineraryId: Types.ObjectId;

  // 1-based order; service derives the date from itinerary.startDate.
  @Prop({ type: Number, required: true, min: 1 })
  dayNumber: number;

  // Identifier from the provided cities dataset.
  @Prop({ type: String, required: true, trim: true })
  cityId: string;

  @Prop({ type: String, trim: true })
  notes?: string;
}

export const ItineraryDaySchema = SchemaFactory.createForClass(ItineraryDay);
ItineraryDaySchema.index({ itineraryId: 1, dayNumber: 1 }, { unique: true });
