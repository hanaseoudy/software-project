// BLG-09: defensive upper bound on the search keyword (not in the requirement sheet)
export const SEARCH_MAX_LENGTH = 100;

// BLG-09: list rows show the first 200 characters of the body
export const EXCERPT_LENGTH = 200;

// BLG-09: one clear field-level message for an invalid keyword, or null when it is valid.
// Never assumes the value is a string; used by the DTO and again by the service.
export function searchTextError(value: unknown): string | null {
  if (typeof value !== 'string') return 'Search must be text';
  const text = value.trim();
  if (!text) return 'Search cannot be empty';
  if (text.length > SEARCH_MAX_LENGTH) return `Search must be at most ${SEARCH_MAX_LENGTH} characters`;
  return null;
}

// BLG-09: first 200 characters of the body, trimmed, with "..." only when it was cut.
// Counts characters (code points), so emoji and accented letters are never split.
export function toExcerpt(body: string): string {
  const characters = Array.from(body.trim());
  if (characters.length <= EXCERPT_LENGTH) return characters.join('');
  return `${characters.slice(0, EXCERPT_LENGTH).join('').trimEnd()}...`;
}
