import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CountryDocument = HydratedDocument<Country>;

@Schema({ collection: 'countries' })
export class Country {
  @Prop({ required: true, unique: true, match: /^[A-Z]{2}$/ })
  code: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, match: /^[A-Z]{3}$/ })
  currency: string;
}

export const CountrySchema = SchemaFactory.createForClass(Country);
