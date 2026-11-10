// GEN-09: what can be reported
export enum ReportTargetType {
  POST = 'post',
  COMMENT = 'comment',
  REVIEW = 'review',
  ITINERARY = 'itinerary',
}

// GEN-09 / GEN-10: report lifecycle
export enum ReportStatus {
  OPEN = 'open',
  DISMISSED = 'dismissed',
  RESOLVED = 'resolved',
}

// GEN-10: how an admin resolved a report
export enum ReportAction {
  DISMISS = 'dismiss',
  HIDE = 'hide',
  DELETE = 'delete',
}
