import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AttractionDocument = HydratedDocument<Attraction>;

@Schema({ collection: 'attractions' })
export class Attraction {
  @Prop({ required: true, unique: true })
  attractionId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  cityId: string;
}

export const AttractionSchema = SchemaFactory.createForClass(Attraction);
