import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CityDocument = HydratedDocument<City>;

@Schema({ collection: 'cities' })
export class City {
  @Prop({ required: true, unique: true })
  cityId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, match: /^[A-Z]{2}$/ })
  countryCode: string;
}

export const CitySchema = SchemaFactory.createForClass(City);
