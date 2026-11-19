import { BadRequestException, HttpException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Error as MongooseError, Model, Types } from 'mongoose';
import { PAGE_SIZE, paginate, skipFor } from '../common/pagination/pagination';
import { User, UserDocument } from '../users/schemas/user.schema';
import { AuditLogItemDto, AuditLogsPageDto } from './dto/audit-log-response.dto';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import {
  AUDIT_ACTION_MAX_LENGTH,
  AUDIT_ACTION_PATTERN,
  AUDIT_DETAILS_MAX_LENGTH,
  AUDIT_TARGET_ID_MAX_LENGTH,
  AUDIT_TARGET_TYPE_MAX_LENGTH,
  AUDIT_TARGET_TYPE_PATTERN,
  OBJECT_ID_PATTERN,
} from './enums/audit-log.enums';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

// GEN-07: what other modules pass to AuditLogsService.record() after an admin action succeeded
export interface AuditEntryInput {
  /** The admin who acted (the authenticated user's id, never an id from the request body or query) */
  actorId: Types.ObjectId | string;
  /** Upper snake case, for example AuditAction.ACCOUNT_SUSPENDED */
  action: string;
  /** Lowercase word, for example AuditTargetType.ACCOUNT */
  targetType: string;
  targetId: Types.ObjectId | string;
  /** The report that led to the action, if any (GEN-10) */
  reportId?: Types.ObjectId | string | null;
  /** Short, non-secret context. Secret-looking keys and values are removed; dropped when too large. */
  details?: Record<string, unknown> | null;
}

type AuditLogRow = {
  _id: Types.ObjectId;
  actorId: Types.ObjectId;
  action: string;
  targetType: string;
  targetId: string;
  reportId?: Types.ObjectId;
  details?: Record<string, unknown>;
  createdAt: Date;
};

type CleanEntry = Omit<AuditLogRow, '_id' | 'createdAt'>;

// Keys and values that may hold secrets are never stored in details
const SECRET_KEY =
  /password|passwd|token|secret|cookie|authori[sz]ation|api[-_]?key|credential|connection[-_]?string|mongo(db)?[-_]?uri/i;
const SECRET_VALUE = /mongodb(\+srv)?:\/\/|^bearer\s|^eyJ[\w-]*\.[\w-]*\./i;
const DETAILS_MAX_DEPTH = 3;

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(
    @InjectModel(AuditLog.name) private readonly auditLogModel: Model<AuditLogDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  // GEN-07: called by other modules after an admin action succeeded. Never throws: a rejected entry or a
  // database failure is logged (without the details) so the admin action itself is never failed or undone.
  async record(entry: AuditEntryInput): Promise<void> {
    let label = 'unknown action';
    try {
      const action: unknown = (entry as { action?: unknown } | null | undefined)?.action;
      if (typeof action === 'string') label = action.trim().slice(0, AUDIT_ACTION_MAX_LENGTH) || label;
      const clean = this.toEntry(entry);
      if (typeof clean === 'string') {
        this.logger.error(`Audit entry not recorded (${label}): ${clean}`);
        return;
      }
      await this.auditLogModel.create(clean);
    } catch (error) {
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown error';
      this.logger.error(`Audit entry not recorded (${label}): ${reason}`);
    }
  }

  // GEN-07: admin list, newest first, page size 10 (GEN-05), optional filters
  async list(query: ListAuditLogsQueryDto): Promise<AuditLogsPageDto> {
    const page = query.page ?? 1;
    const filter: Record<string, unknown> = {};
    if (query.action !== undefined) filter.action = this.requireText(query.action, 'action', 'Action must be text');
    if (query.actorId !== undefined) {
      const actorId = this.toObjectId(query.actorId);
      if (!actorId) throw this.invalid('actorId', 'Actor id must be a valid id');
      filter.actorId = actorId;
    }
    if (query.targetType !== undefined) {
      filter.targetType = this.requireText(query.targetType, 'targetType', 'Target type must be text');
    }
    const createdAt: Record<string, Date> = {};
    if (query.from !== undefined) createdAt.$gte = this.toDate(query.from, 'from', 'From must be a valid ISO 8601 date');
    if (query.to !== undefined) createdAt.$lte = this.toDate(query.to, 'to', 'To must be a valid ISO 8601 date');
    if (createdAt.$gte && createdAt.$lte && createdAt.$gte > createdAt.$lte) {
      throw this.invalid('to', 'To must be the same as or later than from');
    }
    if (createdAt.$gte || createdAt.$lte) filter.createdAt = createdAt;

    const [entries, total] = await this.runDb('Could not load the audit log', () =>
      Promise.all([
        this.auditLogModel
          .find(filter)
          .select('actorId action targetType targetId reportId details createdAt')
          .sort({ createdAt: -1, _id: -1 })
          .skip(skipFor(page))
          .limit(PAGE_SIZE)
          .lean<AuditLogRow[]>()
          .exec(),
        this.auditLogModel.countDocuments(filter).exec(),
      ]),
    );
    const names = await this.loadActorNames(entries.map((entry) => entry.actorId));
    const items: AuditLogItemDto[] = entries.map((entry) => ({
      id: entry._id.toString(),
      actor: { id: entry.actorId.toString(), name: names.get(entry.actorId.toString()) ?? null },
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      reportId: entry.reportId ? entry.reportId.toString() : null,
      details: entry.details ?? null,
      createdAt: entry.createdAt,
    }));
    return paginate(items, total, page);
  }

  // One query for all actors on the page (no N+1). Only the display name is read,
  // never email, password, phone, role or tokens.
  private async loadActorNames(ids: Types.ObjectId[]): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(ids.map((id) => id.toString()))];
    if (uniqueIds.length === 0) return new Map();
    const users = await this.runDb('Could not load the audit log', () =>
      this.userModel
        .find({ _id: { $in: uniqueIds } })
        .select('firstName lastName')
        .lean<{ _id: Types.ObjectId; firstName?: string; lastName?: string }[]>()
        .exec(),
    );
    const names = new Map<string, string>();
    for (const user of users) {
      const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
      if (name) names.set(user._id.toString(), name);
    }
    return names;
  }

  // Checks every field without trusting its type. Returns the cleaned entry, or the reason it was rejected.
  private toEntry(input: unknown): CleanEntry | string {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return 'entry must be an object';
    const raw = input as Record<string, unknown>;

    const actorId = this.toObjectId(raw.actorId);
    if (!actorId) return 'actorId must be a valid id';

    const action = typeof raw.action === 'string' ? raw.action.trim() : '';
    if (!action || action.length > AUDIT_ACTION_MAX_LENGTH || !AUDIT_ACTION_PATTERN.test(action)) {
      return `action must be upper snake case, at most ${AUDIT_ACTION_MAX_LENGTH} characters`;
    }

    const targetType = typeof raw.targetType === 'string' ? raw.targetType.trim().toLowerCase() : '';
    if (!targetType || targetType.length > AUDIT_TARGET_TYPE_MAX_LENGTH || !AUDIT_TARGET_TYPE_PATTERN.test(targetType)) {
      return `targetType must be a lowercase word, at most ${AUDIT_TARGET_TYPE_MAX_LENGTH} characters`;
    }

    const targetId =
      raw.targetId instanceof Types.ObjectId
        ? raw.targetId.toHexString()
        : typeof raw.targetId === 'string'
          ? raw.targetId.trim()
          : '';
    if (!targetId || targetId.length > AUDIT_TARGET_ID_MAX_LENGTH) {
      return `targetId is required, at most ${AUDIT_TARGET_ID_MAX_LENGTH} characters`;
    }

    const entry: CleanEntry = { actorId, action, targetType, targetId };
    if (raw.reportId !== undefined && raw.reportId !== null) {
      const reportId = this.toObjectId(raw.reportId);
      if (!reportId) return 'reportId must be a valid id';
      entry.reportId = reportId;
    }
    if (raw.details !== undefined && raw.details !== null) {
      const details = this.toDetails(raw.details, action);
      if (details) entry.details = details;
    }
    return entry;
  }

  // Details are optional context: when they are invalid or too large the entry is still recorded without them
  private toDetails(value: unknown, action: string): Record<string, unknown> | undefined {
    if (!isPlainObject(value)) {
      this.logger.warn(`Audit details ignored (${action}): details must be an object`);
      return undefined;
    }
    const clean = cleanValue(value, 0) as Record<string, unknown> | undefined;
    if (!clean || Object.keys(clean).length === 0) return undefined;
    if (JSON.stringify(clean).length > AUDIT_DETAILS_MAX_LENGTH) {
      this.logger.warn(`Audit details ignored (${action}): longer than ${AUDIT_DETAILS_MAX_LENGTH} characters`);
      return undefined;
    }
    return clean;
  }

  private toObjectId(value: unknown): Types.ObjectId | null {
    const text =
      value instanceof Types.ObjectId ? value.toHexString() : typeof value === 'string' ? value.trim() : null;
    return text && OBJECT_ID_PATTERN.test(text) ? new Types.ObjectId(text) : null;
  }

  private requireText(value: unknown, field: string, message: string): string {
    if (typeof value !== 'string') throw this.invalid(field, message);
    return value;
  }

  private toDate(value: unknown, field: string, message: string): Date {
    const date = typeof value === 'string' ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) throw this.invalid(field, message);
    return date;
  }

  // GEN-02: same field-level shape as the global ValidationPipe
  private invalid(field: string, message: string) {
    return new BadRequestException({ message: 'Validation failed', errors: { [field]: [message] } });
  }

  // Expected database errors become Nest exceptions; anything else is a 500 with a safe message
  private async runDb<T>(message: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof MongooseError.CastError) throw this.invalid(error.path, 'Invalid value');
      throw new InternalServerErrorException(message);
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

// Copies only JSON-safe values: secret-looking keys and values, "$" or "." keys, functions and
// anything deeper than DETAILS_MAX_DEPTH are dropped. Returns undefined for a value that is dropped.
function cleanValue(value: unknown, depth: number): unknown {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return SECRET_VALUE.test(value) ? undefined : value;
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  if (depth >= DETAILS_MAX_DEPTH) return undefined;
  if (Array.isArray(value)) {
    return value.map((item) => cleanValue(item, depth + 1)).filter((item) => item !== undefined);
  }
  if (!isPlainObject(value)) return undefined;
  const clean: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY.test(key) || key.startsWith('$') || key.includes('.')) continue;
    const cleaned = cleanValue(item, depth + 1);
    if (cleaned !== undefined) clean[key] = cleaned;
  }
  return clean;
}
