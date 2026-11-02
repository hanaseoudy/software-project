import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export enum PassengerType {
  ADULT = 'ADULT',
  CHILD = 'CHILD',
  INFANT = 'INFANT',
}

export enum DocumentType {
  PASSPORT = 'PASSPORT',
  NATIONAL_ID = 'NATIONAL_ID',
}

@Schema({ _id: false })
export class BaggageItem {
  @Prop({ required: true, min: 0 })
  weightKg: number;

  @Prop({ default: false })
  isExtra: boolean;
}
export const BaggageItemSchema = SchemaFactory.createForClass(BaggageItem);

@Schema({ _id: true })
export class Passenger {
  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop({ required: true, enum: PassengerType })
  type: PassengerType;

  @Prop({ required: true })
  dateOfBirth: Date;

  @Prop({ required: true, enum: DocumentType })
  documentType: DocumentType;

  @Prop({ required: true, trim: true })
  documentNumber: string;

  @Prop()
  nationality?: string;

  @Prop({ type: [BaggageItemSchema], default: [] })
  baggage: BaggageItem[];

  @Prop()
  seatNumber?: string;
}

export const PassengerSchema = SchemaFactory.createForClass(Passenger);