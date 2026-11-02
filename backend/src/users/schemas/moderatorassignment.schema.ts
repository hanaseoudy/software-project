
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from './user.schema';

export type ModeratorAssignmentDocument =
  HydratedDocument<ModeratorAssignment>;

export enum ProviderType {
  AIRLINE = 'airline',
  HOTEL = 'hotel',
}

@Schema({ timestamps: true })
export class ModeratorAssignment {
  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    required: true,
    unique: true,
  })
  moderatorId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    required: true,
  })
  providerId: Types.ObjectId;

  @Prop({
    type: String,
    enum: ProviderType,
    required: true,
  })
  providerType: ProviderType;
}

export const ModeratorAssignmentSchema =
  SchemaFactory.createForClass(ModeratorAssignment);
