/** The two pages: `/` (local board) and `/r/<roomId>` (shared room). No router library. */
export type Route = { kind: 'local' } | { kind: 'room'; roomId: string };

const ROOM_PATH = /^\/r\/([A-Za-z0-9_-]{22})\/?$/;

/** Fired on window after goTo changes the URL (history.replaceState fires no event itself). */
export const NAVIGATE_EVENT = 'drawer:navigate';

export function parseRoute(pathname: string): Route {
  const match = ROOM_PATH.exec(pathname);
  return match ? { kind: 'room', roomId: match[1] } : { kind: 'local' };
}

export function goTo(path: string, replace = true): void {
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}
