import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type BudgetEntryDocument = HydratedDocument<BudgetEntry>;

export enum BudgetCategory {
  FOOD = 'FOOD',
  ACCOMMODATION = 'ACCOMMODATION',
  IN_CITY_TRANSPORT = 'IN_CITY_TRANSPORT',
  ACTIVITIES = 'ACTIVITIES',
}

@Schema({ timestamps: true })
export class BudgetEntry {
  @Prop({ type: Types.ObjectId, ref: 'ItineraryDay', required: true, index: true })
  dayId: Types.ObjectId;

  @Prop({ type: String, enum: BudgetCategory, required: true })
  category: BudgetCategory;

  @Prop({ type: String, trim: true })
  description?: string;

  @Prop({ type: Number, required: true, min: 0 })
  amount: number;

  @Prop({ type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ })
  currency: string;
}

export const BudgetEntrySchema = SchemaFactory.createForClass(BudgetEntry);
