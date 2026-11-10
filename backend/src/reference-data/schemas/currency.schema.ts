import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CurrencyDocument = HydratedDocument<Currency>;

@Schema({ collection: 'currencies' })
export class Currency {
  @Prop({ required: true, unique: true, match: /^[A-Z]{3}$/ })
  code: string;
}

export const CurrencySchema = SchemaFactory.createForClass(Currency);
