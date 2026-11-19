import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';

export type FavouriteDocument = HydratedDocument<Favourite>;

export enum FavouriteType {
  HOTEL = 'hotel',
  ITINERARY = 'itinerary',
}

/** BON-02: one saved hotel or public itinerary of a user. */
@Schema({ timestamps: true })
export class Favourite {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ type: String, enum: FavouriteType, required: true })
  itemType: FavouriteType;

  /** The hotel or itinerary id (which collection depends on itemType). */
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  item: Types.ObjectId;
}

export const FavouriteSchema = SchemaFactory.createForClass(Favourite);

// An item can be saved only once per user; also serves the newest-first list.
FavouriteSchema.index({ user: 1, itemType: 1, item: 1 }, { unique: true });
FavouriteSchema.index({ user: 1, createdAt: -1 });
