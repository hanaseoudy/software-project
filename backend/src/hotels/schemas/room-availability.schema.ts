import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RoomAvailabilityDocument = HydratedDocument<RoomAvailability>;

export enum AvailabilityType {
  AVAILABLE = 'available',
  BLOCKED = 'blocked',
}

@Schema({ timestamps: true })
export class RoomAvailability {
  @Prop({ type: Types.ObjectId, ref: 'Room', required: true, index: true })
  room: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Hotel', required: true, index: true })
  hotel: Types.ObjectId;

  @Prop({ type: String, enum: AvailabilityType, required: true })
  type: AvailabilityType;

  @Prop({ type: Date, required: true })
  startDate: Date;

  @Prop({ type: Date, required: true })
  endDate: Date;

  @Prop({ trim: true, default: '' })
  reason: string;
}

export const RoomAvailabilitySchema =
  SchemaFactory.createForClass(RoomAvailability);

RoomAvailabilitySchema.index({ room: 1, type: 1, startDate: 1, endDate: 1 });