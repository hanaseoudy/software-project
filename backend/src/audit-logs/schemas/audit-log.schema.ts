import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { Report } from '../../reports/schemas/report.schema';
import { User } from '../../users/schemas/user.schema';
import {
  AUDIT_ACTION_MAX_LENGTH,
  AUDIT_ACTION_PATTERN,
  AUDIT_TARGET_ID_MAX_LENGTH,
  AUDIT_TARGET_TYPE_MAX_LENGTH,
  AUDIT_TARGET_TYPE_PATTERN,
} from '../enums/audit-log.enums';

export type AuditLogDocument = HydratedDocument<AuditLog>;

// GEN-07: one admin action. Entries are append-only: every field is immutable and
// updates, replacements and deletes are refused by the hooks below.
@Schema({ timestamps: { createdAt: true, updatedAt: false }, versionKey: false })
export class AuditLog {
  // The admin who acted
  @Prop({ type: SchemaTypes.ObjectId, ref: User.name, required: true, immutable: true })
  actorId!: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    trim: true,
    maxlength: AUDIT_ACTION_MAX_LENGTH,
    match: AUDIT_ACTION_PATTERN,
    immutable: true,
  })
  action!: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: AUDIT_TARGET_TYPE_MAX_LENGTH,
    match: AUDIT_TARGET_TYPE_PATTERN,
    immutable: true,
  })
  targetType!: string;

  // Stored as text so both ObjectId targets and other ids fit
  @Prop({ type: String, required: true, trim: true, maxlength: AUDIT_TARGET_ID_MAX_LENGTH, immutable: true })
  targetId!: string;

  // The report that led to the action, if any (GEN-10)
  @Prop({ type: SchemaTypes.ObjectId, ref: Report.name, immutable: true })
  reportId?: Types.ObjectId;

  // Short, non-secret context; cleaned and size-limited by AuditLogsService.record()
  @Prop({ type: SchemaTypes.Mixed, immutable: true })
  details?: Record<string, unknown>;

  createdAt?: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// Newest first listing, alone or combined with the actor or action filters
AuditLogSchema.index({ createdAt: -1, _id: -1 });
AuditLogSchema.index({ actorId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ targetType: 1, targetId: 1 });

const APPEND_ONLY = 'Audit log entries cannot be changed or deleted';

AuditLogSchema.pre('save', function () {
  if (!this.isNew) throw new Error(APPEND_ONLY);
});

AuditLogSchema.pre(
  [
    'updateOne',
    'updateMany',
    'findOneAndUpdate',
    'replaceOne',
    'findOneAndReplace',
    'deleteOne',
    'deleteMany',
    'findOneAndDelete',
  ],
  { document: true, query: true },
  function () {
    throw new Error(APPEND_ONLY);
  },
);
