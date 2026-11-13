import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';

export type TransportCostDocument = HydratedDocument<TransportCost>;

export enum IntercityTransportMode {
  TRAIN = 'TRAIN',
  BUS = 'BUS',
  FLIGHT = 'FLIGHT',
  CAR = 'CAR',
  FERRY = 'FERRY',
  OTHER = 'OTHER',
}

@Schema({ timestamps: true })
export class TransportCost {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ItineraryDay', required: true, index: true })
  dayId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  fromCityId: string;

  @Prop({ type: String, required: true, trim: true })
  toCityId: string;

  @Prop({ type: String, enum: IntercityTransportMode, required: true })
  mode: IntercityTransportMode;

  @Prop({ type: Number, required: true, min: 0 })
  amount: number;

  @Prop({ type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ })
  currency: string;
}

export const TransportCostSchema = SchemaFactory.createForClass(TransportCost);
