import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
export class CachedExchangeRates {
  @Prop({ type: Date, required: true })
  providerTimestamp!: Date;

  @Prop({ type: String, required: true })
  rateDate!: string;

  @Prop({ type: Date, required: true })
  fetchedAt!: Date;

  @Prop({ type: Map, of: String, required: true })
  rates!: Map<string, string>;
}

const CachedExchangeRatesSchema =
  SchemaFactory.createForClass(CachedExchangeRates);

@Schema({ collection: 'exchange_rate_snapshots', versionKey: false })
export class ExchangeRateSnapshot {
  @Prop({ type: String })
  _id!: string;

  @Prop({ type: String })
  refreshDay?: string;

  @Prop({ type: Number })
  attempts?: number;

  @Prop({ type: String })
  claimToken?: string;

  @Prop({ type: Date })
  retryAfter?: Date;

  @Prop({ type: String, enum: ['pending', 'failed', 'succeeded'] })
  status?: 'pending' | 'failed' | 'succeeded';

  @Prop({ type: CachedExchangeRatesSchema })
  lastGood?: CachedExchangeRates;
}

export type ExchangeRateSnapshotDocument =
  HydratedDocument<ExchangeRateSnapshot>;
export const ExchangeRateSnapshotSchema =
  SchemaFactory.createForClass(ExchangeRateSnapshot);
