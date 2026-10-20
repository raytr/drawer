import { getIdentity, loadOwnerToken, saveOwnerToken } from './identity';
import { PALETTE } from '../state/tool-settings';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

test('keeps userKey per tab and name/color per browser', () => {
  const a = getIdentity(localStorage, sessionStorage);
  expect(a.userKey).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(a.name.length).toBeGreaterThan(0);
  expect(PALETTE).toContain(a.color);
  expect(getIdentity(localStorage, sessionStorage)).toEqual(a);
  sessionStorage.clear();
  const b = getIdentity(localStorage, sessionStorage);
  expect(b.userKey).not.toBe(a.userKey);
  expect([b.name, b.color]).toEqual([a.name, a.color]);
});

test('replaces stored values that are not valid', () => {
  localStorage.setItem('drawer.identity', '{"name":"","color":"red"}');
  sessionStorage.setItem('drawer.userKey', 'short');
  const id = getIdentity(localStorage, sessionStorage);
  expect(id.userKey).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(id.name.length).toBeGreaterThan(0);
  expect(PALETTE).toContain(id.color);
  localStorage.setItem('drawer.identity', 'not json');
  expect(getIdentity(localStorage, sessionStorage).userKey).toBe(id.userKey);
});

test('works when storage throws, and keeps the same userKey in this page', () => {
  const broken = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  } as unknown as Storage;
  const a = getIdentity(broken, broken);
  expect(a.userKey).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(getIdentity(broken, broken).userKey).toBe(a.userKey);
});

test('stores the owner token per room', () => {
  saveOwnerToken('R'.repeat(22), 't'.repeat(43));
  expect(loadOwnerToken('R'.repeat(22))).toBe('t'.repeat(43));
  expect(localStorage.getItem('drawer.owner.' + 'R'.repeat(22))).toBe('t'.repeat(43));
  expect(loadOwnerToken('X'.repeat(22))).toBeNull();
});
