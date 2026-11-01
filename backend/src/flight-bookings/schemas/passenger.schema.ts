import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export enum PassengerType {
  ADULT = 'ADULT',
  CHILD = 'CHILD',
  INFANT = 'INFANT',
}

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

  @Prop({ required: true })
  passportNumber: string;

  @Prop()
  nationality?: string;

  @Prop({ default: 0, min: 0 })
  extraBags: number;

  @Prop()
  seatNumber?: string;
}

export const PassengerSchema = SchemaFactory.createForClass(Passenger);