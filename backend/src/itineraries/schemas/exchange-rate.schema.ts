import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ExchangeRateDocument = HydratedDocument<ExchangeRate>;

@Schema({ timestamps: true })
export class ExchangeRate {
  @Prop({ type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ })
  baseCurrency: string;

  @Prop({ type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ })
  targetCurrency: string;

  @Prop({ type: Number, required: true, min: 0, validate: (v: number) => v > 0 })
  rate: number;

  // Date the rate applies to; retained for historical fallback.
  @Prop({ type: Date, required: true })
  rateDate: Date;

  @Prop({ type: Date, required: true, default: Date.now })
  fetchedAt: Date;

  @Prop({ type: String, trim: true })
  provider?: string;
}

export const ExchangeRateSchema = SchemaFactory.createForClass(ExchangeRate);
ExchangeRateSchema.index({ baseCurrency: 1, targetCurrency: 1, rateDate: 1 }, { unique: true });
ExchangeRateSchema.index({ baseCurrency: 1, targetCurrency: 1, rateDate: -1 });
