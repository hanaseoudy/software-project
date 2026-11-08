import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';

export type ItineraryDayDocument = HydratedDocument<ItineraryDay>;

@Schema({ timestamps: true })
export class ItineraryDay {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Itinerary', required: true, index: true })
  itineraryId: Types.ObjectId;

  // Date = itinerary.startDate + (dayNumber - 1) days; do not store it.
  @Prop({ type: Number, required: true, min: 1, max: 60 })
  dayNumber: number;

  // Service validates this against the shared seeded city list.
  @Prop({ type: String, required: true, trim: true })
  cityId: string;

  @Prop({ type: String, trim: true })
  notes?: string;
}

export const ItineraryDaySchema = SchemaFactory.createForClass(ItineraryDay);
ItineraryDaySchema.index({ itineraryId: 1, dayNumber: 1 }, { unique: true });
ItineraryDaySchema.index({ cityId: 1 });
