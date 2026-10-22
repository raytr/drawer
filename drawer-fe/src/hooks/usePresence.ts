import { useSyncExternalStore } from 'react';
import type { Presence, PresenceSnapshot } from '../engine/presence';

const EMPTY: PresenceSnapshot = { me: null, members: [] };
const noSubscribe = () => () => {};
const empty = () => EMPTY;

/** Reads who is in the room. Cursor moves do not re-render; only member changes do. */
export function usePresence(presence: Presence | null): PresenceSnapshot {
  return useSyncExternalStore(presence?.subscribe ?? noSubscribe, presence?.getSnapshot ?? empty);
}
