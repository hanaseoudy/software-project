import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, Schema as MongooseSchema } from 'mongoose';
import { REPORT_REASON_MAX_LENGTH, ReportContentType, ReportStatus } from '../enums/report.enums';

export type ReportDocument = HydratedDocument<Report>;

@Schema({ timestamps: true })
export class Report {
  // Indexed through the unique (reporter, contentType, contentId) index below, which starts with reporter
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  reporter: Types.ObjectId;

  @Prop({ type: String, enum: ReportContentType, required: true })
  contentType: ReportContentType;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  contentId: Types.ObjectId;

  // GEN-09: enforced in the database as well as the DTO
  @Prop({ required: true, trim: true, minlength: 1, maxlength: REPORT_REASON_MAX_LENGTH })
  reason: string;

  @Prop({ type: String, enum: ReportStatus, default: ReportStatus.OPEN })
  status: ReportStatus;
}

export const ReportSchema = SchemaFactory.createForClass(Report);
// GEN-09: at most one report per user per item; the database rejects concurrent duplicates
ReportSchema.index({ reporter: 1, contentType: 1, contentId: 1 }, { unique: true });
// GEN-10: open reports, newest first
ReportSchema.index({ status: 1, createdAt: -1 });
// GEN-10: close every open report about a moderated item
ReportSchema.index({ contentType: 1, contentId: 1, status: 1 });
