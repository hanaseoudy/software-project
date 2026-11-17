import { randomBytes } from 'node:crypto';

// 32 characters (no 0/O/1/I) so a random byte maps evenly with no modulo bias.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

export const HOTEL_REFERENCE_PREFIX = 'HTL-';
export const HOTEL_REFERENCE_PATTERN = /^HTL-[A-HJ-NP-Z2-9]{8}$/;

/** HTL-17: random, human-friendly booking reference such as HTL-7K3M9QXA. */
export function generateBookingReference(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `${HOTEL_REFERENCE_PREFIX}${code}`;
}
