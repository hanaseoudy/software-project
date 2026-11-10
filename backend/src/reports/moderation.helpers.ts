// GEN-10: pure helpers for admin moderation (no Nest imports, so they can be unit tested directly).

export const PREVIEW_LENGTH = 100;
export const REPORT_ALREADY_RESOLVED_MESSAGE = 'Report already resolved';

// Types whose content admins can hide / unhide / delete. Reviews and itineraries belong to other
// modules that are not ready for moderation yet (see moderationUnavailableMessage).
export const MODERATABLE_TYPES: readonly string[] = ['post', 'comment'];

export function isModeratable(type: string): boolean {
  return MODERATABLE_TYPES.includes(type);
}

export function moderationUnavailableMessage(type: string): string {
  return `Moderation for ${type} is not available yet`;
}

// dismiss -> dismissed, hide / delete -> resolved
export function statusForAction(action: string): 'dismissed' | 'resolved' {
  return action === 'dismiss' ? 'dismissed' : 'resolved';
}

// Short single-line preview of reported content.
export function buildPreview(text: string | null | undefined, maxLength = PREVIEW_LENGTH): string | null {
  if (text === null || text === undefined) return null;
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength).trimEnd()}...`;
}

export interface PreviewSource {
  title?: string;
  content?: string;
  text?: string;
  rating?: number;
  comment?: string;
}

export function previewFor(type: string, doc: PreviewSource | undefined): string | null {
  if (!doc) return null;
  switch (type) {
    case 'post':
      return buildPreview(doc.content ? `${doc.title ?? ''}: ${doc.content}` : doc.title);
    case 'comment':
      return buildPreview(doc.text);
    case 'review':
      return buildPreview(`${doc.rating ?? '?'}/5${doc.comment ? `: ${doc.comment}` : ''}`);
    default:
      return null;
  }
}

// key for grouping reports by item
export function itemKey(type: string, id: { toString(): string } | string): string {
  return `${type}:${String(id)}`;
}
