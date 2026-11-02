import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ExchangeRateDocument = HydratedDocument<ExchangeRate>;

// Optional database cache for rates fetched by the backend from FXRatesAPI.
@Schema({ timestamps: true })
export class ExchangeRate {
  @Prop({ type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ })
  baseCurrency: string;

  @Prop({ type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ })
  targetCurrency: string;

  @Prop({ type: Number, required: true, min: 0 })
  rate: number;

  @Prop({ type: Date, required: true })
  fetchedAt: Date;

  @Prop({ type: String, default: 'FXRatesAPI' })
  provider: string;
}

export const ExchangeRateSchema = SchemaFactory.createForClass(ExchangeRate);
ExchangeRateSchema.index({ baseCurrency: 1, targetCurrency: 1 }, { unique: true });
