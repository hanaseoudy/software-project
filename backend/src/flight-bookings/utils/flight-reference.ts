import { randomBytes } from 'node:crypto';

// 32 characters (no 0/O/1/I) so a random byte maps evenly with no modulo bias.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

export const FLIGHT_REFERENCE_PREFIX = 'FLT-';
export const FLIGHT_REFERENCE_PATTERN = /^FLT-[A-HJ-NP-Z2-9]{8}$/;

/** FLT-23: random, human-friendly booking reference such as FLT-7K3M9QXA. */
export function generateFlightReference(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `${FLIGHT_REFERENCE_PREFIX}${code}`;
}
