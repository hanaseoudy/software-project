import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongoSchema } from 'mongoose';
import { BookingType } from '../../payments/enums/payment.enums';
export type ItineraryBookingLinkDocument =
  HydratedDocument<ItineraryBookingLink>;
@Schema({ timestamps: true, collection: 'itinerarybookinglinks' })
export class ItineraryBookingLink {
  @Prop({
    type: MongoSchema.Types.ObjectId,
    ref: 'Itinerary',
    required: true,
    index: true,
  })
  itineraryId!: Types.ObjectId;
  @Prop({ type: String, enum: BookingType, required: true })
  bookingType!: BookingType;
  @Prop({ type: MongoSchema.Types.ObjectId, required: true })
  bookingId!: Types.ObjectId;
  @Prop({
    type: [MongoSchema.Types.ObjectId],
    required: true,
    validate: [
      (ids: Types.ObjectId[]) =>
        ids.length >= 1 &&
        ids.length <= 60 &&
        new Set(ids.map(String)).size === ids.length,
      'Select 1-60 distinct days',
    ],
  })
  dayIds!: Types.ObjectId[];
}
export const ItineraryBookingLinkSchema =
  SchemaFactory.createForClass(ItineraryBookingLink);
ItineraryBookingLinkSchema.index(
  { bookingType: 1, bookingId: 1 },
  { unique: true },
);
