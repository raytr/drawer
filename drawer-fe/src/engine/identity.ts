import { PALETTE } from '../state/tool-settings';
import { newStrokeId } from './ids';

export interface Identity {
  userKey: string;
  name: string;
  color: string;
}

const NAMES = ['Fox', 'Owl', 'Cat', 'Bear', 'Otter', 'Lynx', 'Crane', 'Seal'];
const ID_22 = /^[A-Za-z0-9_-]{22}$/;
const COLOR = /^#[0-9a-f]{6}$/;
const USER_KEY = 'drawer.userKey';
const IDENTITY = 'drawer.identity';

/** Used when the browser blocks storage, so the values stay the same while this page lives. */
const memory = new Map<string, string>();

function read(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(storage: Storage, key: string, value: string): void {
  memory.set(key, value);
  try {
    storage.setItem(key, value);
  } catch {
    // Storage is blocked (private mode, settings); the memory copy is enough for this page.
  }
}

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

function parseNameColor(text: string | null): { name: string; color: string } | null {
  if (!text) return null;
  try {
    const v = JSON.parse(text) as { name?: unknown; color?: unknown };
    if (typeof v.name !== 'string' || v.name.length < 1 || v.name.length > 24) return null;
    if (typeof v.color !== 'string' || !COLOR.test(v.color)) return null;
    return { name: v.name, color: v.color };
  } catch {
    return null;
  }
}

/**
 * The anonymous identity (spec 7.3): userKey per tab in sessionStorage (it survives a reload of
 * the tab), name and color per browser in localStorage.
 */
export function getIdentity(local: Storage = localStorage, session: Storage = sessionStorage): Identity {
  let userKey = read(session, USER_KEY);
  if (!userKey || !ID_22.test(userKey)) {
    userKey = newStrokeId();
    write(session, USER_KEY, userKey);
  }
  let look = parseNameColor(read(local, IDENTITY));
  if (!look) {
    look = { name: pick(NAMES), color: pick(PALETTE) };
    write(local, IDENTITY, JSON.stringify(look));
  }
  return { userKey, ...look };
}

export function saveOwnerToken(roomId: string, token: string, local: Storage = localStorage): void {
  write(local, `drawer.owner.${roomId}`, token);
}

export function loadOwnerToken(roomId: string, local: Storage = localStorage): string | null {
  return read(local, `drawer.owner.${roomId}`);
}
