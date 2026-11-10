// GEN-09: pure helpers for reports (no Nest imports, so they can be unit tested directly).

export const REPORTS_PAGE_SIZE = 10;
export const ALREADY_REPORTED_MESSAGE = 'You have already reported this item';

// Content types whose model is not on develop yet (no module registers an Itinerary model).
export const UNAVAILABLE_REPORT_TYPES: readonly string[] = ['itinerary'];

export function notAvailableMessage(type: string): string {
  return `Reporting ${type} is not available yet`;
}

// MongoDB duplicate key error (unique index violation)
export function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function skipFor(page: number): number {
  return (page - 1) * REPORTS_PAGE_SIZE;
}

export function paginate<T>(items: T[], total: number, page: number): Page<T> {
  return {
    items,
    total,
    page,
    pageSize: REPORTS_PAGE_SIZE,
    totalPages: Math.ceil(total / REPORTS_PAGE_SIZE),
  };
}

type Id = { toString(): string } | string;

export interface ReportLike {
  _id: Id;
  reporter: Id;
  targetType: string;
  targetId: Id;
  reason: string;
  status: string;
  action?: string | null;
  resolvedBy?: Id | null;
  resolvedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ReportView {
  id: string;
  reporter: string;
  targetType: string;
  targetId: string;
  reason: string;
  status: string;
  action: string | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toReportResponse(report: ReportLike): ReportView {
  return {
    id: String(report._id),
    reporter: String(report.reporter),
    targetType: report.targetType,
    targetId: String(report.targetId),
    reason: report.reason,
    status: report.status,
    action: report.action ?? null,
    resolvedBy: report.resolvedBy ? String(report.resolvedBy) : null,
    resolvedAt: report.resolvedAt ?? null,
    createdAt: report.createdAt as Date,
    updatedAt: report.updatedAt as Date,
  };
}
