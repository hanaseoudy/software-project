import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Schema as MongooseSchema } from 'mongoose';

@Schema({ _id: false })
export class BookedRoom {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Room', required: true })
  room!: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  pricePerNight!: number;

  @Prop({ required: true, min: 0 })
  adults!: number;

  @Prop({ required: true, min: 0 })
  children!: number;
}

export const BookedRoomSchema = SchemaFactory.createForClass(BookedRoom);