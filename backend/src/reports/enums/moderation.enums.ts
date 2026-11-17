// GEN-10: how an admin resolves an open report
export enum ResolveAction {
  DISMISS = 'dismiss',
  HIDE = 'hide',
  DELETE = 'delete',
}

// GEN-10: what a direct admin action or a resolution did to the content
export enum ModerationAction {
  HIDE = 'hide',
  DELETE = 'delete',
}

// GEN-10: length of the comment and review text shown in the admin report list
export const REPORT_PREVIEW_LENGTH = 100;
