import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Schema as MongooseSchema } from 'mongoose';
import { PLATFORM_CURRENCY } from '../../common/constants/currency.constants';

@Schema({ _id: false })
export class BookedRoom {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Room', required: true })
  room!: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  pricePerNight!: number;


  @Prop({ required: true, default: PLATFORM_CURRENCY, enum: [PLATFORM_CURRENCY], immutable: true })
  currency!: string; // PAY-04: always USD

  @Prop({ required: true, min: 0 })
  adults!: number;

  @Prop({ required: true, min: 0 })
  children!: number;
}

export const BookedRoomSchema = SchemaFactory.createForClass(BookedRoom);