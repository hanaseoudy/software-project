// GEN-07: admin actions known so far. This is not a closed list: any upper snake case name that matches
// AUDIT_ACTION_PATTERN is accepted, so other modules can record new actions without changing this module.
export enum AuditAction {
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
  ACCOUNT_REACTIVATED = 'ACCOUNT_REACTIVATED',
  PROVIDER_DEACTIVATED = 'PROVIDER_DEACTIVATED',
  PROVIDER_REACTIVATED = 'PROVIDER_REACTIVATED',
  MODERATOR_CREATED = 'MODERATOR_CREATED',
  PASSWORD_RESET = 'PASSWORD_RESET',
  REPORT_DISMISSED = 'REPORT_DISMISSED',
  CONTENT_HIDDEN = 'CONTENT_HIDDEN',
  CONTENT_DELETED = 'CONTENT_DELETED',
}

// GEN-07: kinds of target known so far (also an open list, validated by AUDIT_TARGET_TYPE_PATTERN)
export enum AuditTargetType {
  ACCOUNT = 'account',
  HOTEL = 'hotel',
  AIRLINE = 'airline',
  POST = 'post',
  COMMENT = 'comment',
  REVIEW = 'review',
  ITINERARY = 'itinerary',
  REPORT = 'report',
}

// Upper snake case, for example ACCOUNT_SUSPENDED
export const AUDIT_ACTION_PATTERN = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;
export const AUDIT_ACTION_MAX_LENGTH = 64;

// Lowercase word, for example account or itinerary
export const AUDIT_TARGET_TYPE_PATTERN = /^[a-z][a-z0-9_-]*$/;
export const AUDIT_TARGET_TYPE_MAX_LENGTH = 30;

export const AUDIT_TARGET_ID_MAX_LENGTH = 100;

// A MongoDB ObjectId as 24 hex characters
export const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

// Short, non-secret context only: the details object is dropped when its JSON is longer than this
export const AUDIT_DETAILS_MAX_LENGTH = 2000;
