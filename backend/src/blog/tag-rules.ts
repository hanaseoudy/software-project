import { BadRequestException } from '@nestjs/common';

// BLG-08: a post can have up to 5 tags, each at most 30 characters
export const MAX_TAGS = 5;
export const MAX_TAG_LENGTH = 30;

const tagsError = (message: string) =>
  new BadRequestException({ message: 'Validation failed', errors: { tags: [message] } });

// BLG-08: service-level check that never assumes the values are strings.
// Trims, lowercases and removes duplicates, then re-checks the limits (same messages as CreatePostDto).
export function normalizeTags(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw tagsError('Tags must be a list');

  const tags: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') throw tagsError('Each tag must be text');
    const tag = item.trim().toLowerCase();
    if (!tag) throw tagsError('Tags cannot be empty');
    if (tag.length > MAX_TAG_LENGTH) throw tagsError(`Each tag must be at most ${MAX_TAG_LENGTH} characters`);
    if (!tags.includes(tag)) tags.push(tag);
  }
  if (tags.length > MAX_TAGS) throw tagsError(`A post can have at most ${MAX_TAGS} tags`);
  return tags;
}

// BLG-08: user search text is matched literally, never as a regular expression
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
