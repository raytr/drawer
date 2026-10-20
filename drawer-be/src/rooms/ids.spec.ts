import {
  hashKey,
  isRoomId,
  isUserKey,
  newOwnerKey,
  newRoomId,
  sameHash,
} from './ids';

describe('ids', () => {
  it('makes 22 and 43 char base64url ids', () => {
    expect(newRoomId()).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(newOwnerKey()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newRoomId()).not.toBe(newRoomId());
  });

  it('hashKey is sha256 hex and sameHash compares', () => {
    expect(hashKey('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sameHash(hashKey('a'), hashKey('a'))).toBe(true);
    expect(sameHash(hashKey('a'), hashKey('b'))).toBe(false);
  });

  it('checks room ids and user keys', () => {
    expect(isRoomId('A'.repeat(22))).toBe(true);
    expect(isUserKey('a-_'.repeat(7) + 'x')).toBe(true);
    expect(isRoomId('A'.repeat(21))).toBe(false);
    expect(isRoomId('A'.repeat(21) + '/')).toBe(false);
    expect(isUserKey(42)).toBe(false);
  });
});
