import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ActivityDocument = HydratedDocument<Activity>;

@Schema({ timestamps: true })
export class Activity {
  @Prop({ type: Types.ObjectId, ref: 'ItineraryDay', required: true, index: true })
  dayId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  title: string;

  @Prop({ type: String, trim: true })
  description?: string;

  @Prop({ type: String, trim: true })
  attractionId?: string;

  @Prop({ type: Date })
  startTime?: Date;

  @Prop({ type: Date })
  endTime?: Date;

  @Prop({ type: Number, min: 0, default: 0 })
  order: number;

  @Prop({ type: [String], default: [] })
  images: string[];
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);
ActivitySchema.index({ dayId: 1, order: 1 });
