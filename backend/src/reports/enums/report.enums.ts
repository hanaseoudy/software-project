// GEN-09: the four kinds of content a registered user can report
export enum ReportContentType {
  POST = 'post',
  COMMENT = 'comment',
  REVIEW = 'review',
  ITINERARY = 'itinerary',
}

// GEN-09 creates reports as open; GEN-10 (admin resolution) uses the other values later
export enum ReportStatus {
  OPEN = 'open',
  DISMISSED = 'dismissed',
  RESOLVED = 'resolved',
}

// GEN-09: the sheet gives no limit for the reason, so 500 characters is a defensive maximum
export const REPORT_REASON_MAX_LENGTH = 500;
