import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RoomLockDocument = HydratedDocument<RoomLock>;

/**
 * One tiny document per room. HTL-18 updates it inside the booking
 * transaction so two concurrent holds on the same room conflict and are
 * serialized (prevents overlapping reservations).
 */
@Schema()
export class RoomLock {
  @Prop({ type: Types.ObjectId, ref: 'Room', required: true, unique: true })
  room: Types.ObjectId;

  @Prop({ default: 0 })
  version: number;
}

export const RoomLockSchema = SchemaFactory.createForClass(RoomLock);
