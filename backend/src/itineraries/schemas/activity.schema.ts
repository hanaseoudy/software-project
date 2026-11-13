import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';

export type ActivityDocument = HydratedDocument<Activity>;

@Schema({ timestamps: true })
export class Activity {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ItineraryDay', required: true, index: true })
  dayId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  name: string;

  @Prop({ type: String, required: true, trim: true })
  description: string;

  // Optional time displayed within the day, e.g. "14:30".
  @Prop({ type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ })
  time?: string;

  @Prop({ type: Number, min: 0 })
  cost?: number;

  // Required by service when cost is provided; validate against supported currencies.
  @Prop({ type: String, uppercase: true, match: /^[A-Z]{3}$/ })
  currency?: string;

  // GEN-08: upload endpoint checks JPG/PNG and <=5MB per file.
  @Prop({ type: [String], default: [], validate: [(v: string[]) => v.length <= 5, 'Maximum 5 images per activity'] })
  images: string[];
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);
