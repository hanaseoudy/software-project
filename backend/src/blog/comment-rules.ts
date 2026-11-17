// BLG-05: a comment is non-empty and at most 500 characters
export const COMMENT_MAX_LENGTH = 500;

// BLG-05: one clear field-level message for invalid comment text, or null when it is valid.
// Never assumes the value is a string; used by the DTO and again by the service.
export function commentTextError(value: unknown): string | null {
  if (value === undefined || value === null) return 'Comment cannot be empty';
  if (typeof value !== 'string') return 'Comment must be text';
  const text = value.trim();
  if (!text) return 'Comment cannot be empty';
  if (text.length > COMMENT_MAX_LENGTH) return `Comment must be at most ${COMMENT_MAX_LENGTH} characters`;
  return null;
}
