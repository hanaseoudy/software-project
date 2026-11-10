import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';
import { ReportAction, ReportStatus, ReportTargetType } from '../enums/report.enums';

export type ReportDocument = HydratedDocument<Report>;

// GEN-09: a user's report of a post, comment, review or itinerary
@Schema({ timestamps: true })
export class Report {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  reporter!: Types.ObjectId;

  @Prop({ type: String, enum: ReportTargetType, required: true })
  targetType!: ReportTargetType;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  targetId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, minlength: 5, maxlength: 500 })
  reason!: string;

  @Prop({ type: String, enum: ReportStatus, default: ReportStatus.OPEN })
  status!: ReportStatus;

  // GEN-10: filled in when an admin resolves the report
  @Prop({ type: String, enum: ReportAction, default: null })
  action?: ReportAction | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  resolvedBy?: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  resolvedAt?: Date | null;
}

export const ReportSchema = SchemaFactory.createForClass(Report);
// GEN-09: each user can report a given item only once (enforced by the database)
ReportSchema.index({ reporter: 1, targetType: 1, targetId: 1 }, { unique: true });
// GEN-10: open reports per item, newest first
ReportSchema.index({ status: 1, targetType: 1, targetId: 1, createdAt: -1 });
