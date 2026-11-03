import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AirlineDocument = HydratedDocument<Airline>;

export enum CabinClass {
  ECONOMY = 'ECONOMY',
  PREMIUM_ECONOMY = 'PREMIUM_ECONOMY',
  BUSINESS = 'BUSINESS',
  FIRST = 'FIRST',
}

// How much baggage one cabin class gets for free
@Schema({ _id: false })
export class BaggagePolicy {
  @Prop({ min: 0, default: 0 })
  extraBagPrice: number; // price per extra bag

  @Prop({ min: 0, default: 0 })
  maxExtraBagsPerPassenger: number;
}
export const BaggagePolicySchema = SchemaFactory.createForClass(BaggagePolicy);

// One refund rule: "if cancelled at least X hours before departure, refund Y%"
@Schema({ _id: false })
export class CancellationRule {
  @Prop({ required: true, min: 0 })
  daysBeforeDeparture: number;

  @Prop({ required: true, min: 0, max: 100 })
  refundPercent: number;
}
export const CancellationRuleSchema = SchemaFactory.createForClass(CancellationRule);

@Schema({ _id: false })
export class CancellationPolicy {
  @Prop({ type: [CancellationRuleSchema], default: [] })
  rules: CancellationRule[];
}
export const CancellationPolicySchema = SchemaFactory.createForClass(CancellationPolicy);

@Schema({ timestamps: true })
export class Airline {
  @Prop({ required: true, unique: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, uppercase: true, minlength: 2, maxlength: 3 })
  code: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  logoUrl?: string;

  @Prop()
  description?: string;

  @Prop({ type: BaggagePolicySchema, default: () => ({}) })
  baggagePolicy: BaggagePolicy;

  @Prop({ type: CancellationPolicySchema, default: () => ({}) })
  cancellationPolicy: CancellationPolicy;
}

export const AirlineSchema = SchemaFactory.createForClass(Airline);