import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AirlineDocument = HydratedDocument<Airline>;

export enum CabinClass {
  ECONOMY = 'economy',
  PREMIUM_ECONOMY = 'premium_economy',
  BUSINESS = 'business',
  FIRST = 'first',
}

// How much baggage one cabin class gets for free
@Schema({ _id: false })
export class BaggageAllowance {
  @Prop({ required: true, enum: CabinClass })
  cabinClass: CabinClass;

  @Prop({ required: true, min: 0 })
  cabinBagKg: number;

  @Prop({ required: true, min: 0 })
  checkedBagKg: number;
}
export const BaggageAllowanceSchema = SchemaFactory.createForClass(BaggageAllowance);

@Schema({ _id: false })
export class BaggagePolicy {
  @Prop({ type: [BaggageAllowanceSchema], default: [] })
  allowances: BaggageAllowance[];

  @Prop({ min: 0, default: 0 })
  extraBagPricePerKg: number;
}
export const BaggagePolicySchema = SchemaFactory.createForClass(BaggagePolicy);

// One refund rule: "if cancelled at least X hours before departure, refund Y%"
@Schema({ _id: false })
export class CancellationRule {
  @Prop({ required: true, min: 0 })
  hoursBeforeDeparture: number;

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

  @Prop({ required: true, unique: true, uppercase: true, length: 2 })
  code: string; // IATA airline code, e.g. "MS"

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