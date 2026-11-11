import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';
import { integerValidator } from './validators';

export type RoomDocument = HydratedDocument<Room>;

@Schema({ timestamps: true })
export class Room {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Hotel', required: true, index: true })
  hotel: Types.ObjectId;

  @Prop({ required: true, trim: true, uppercase: true })
  roomNumber: string;

  @Prop({ required: true, trim: true })
  type: string;

  @Prop({ required: true, min: 1, validate: integerValidator })
  beds: number;

  @Prop({ required: true, min: 1, validate: integerValidator })
  maxOccupancy: number;

  @Prop({ required: true, min: 0.01 })
  pricePerNight: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const RoomSchema = SchemaFactory.createForClass(Room);

RoomSchema.index({ hotel: 1, roomNumber: 1 }, { unique: true });