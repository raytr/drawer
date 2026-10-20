import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const ID_22 = /^[A-Za-z0-9_-]{22}$/;

/** 16 random bytes as base64url: 22 characters. */
export function newRoomId(): string {
  return randomBytes(16).toString('base64url');
}

/** 32 random bytes as base64url: 43 characters. Only its hash is stored. */
export function newOwnerKey(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 as hex. Used for the owner key and for userKey (the stroke author). */
export function hashKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Compares two hashes in constant time. */
export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function isRoomId(v: unknown): v is string {
  return typeof v === 'string' && ID_22.test(v);
}

export function isUserKey(v: unknown): v is string {
  return typeof v === 'string' && ID_22.test(v);
}
