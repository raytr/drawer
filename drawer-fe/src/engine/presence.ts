import type { BoardLink } from './board-controller';
import type { CursorData, Member, PresenceData, WelcomeData } from './protocol';

export interface PresenceSnapshot {
  /** This tab's memberId, or null when not in a live room. */
  me: string | null;
  members: readonly Member[];
}

type Listener = () => void;

/** Spec 4: cursors are throttled to 10 Hz on the client. */
const CURSOR_INTERVAL_MS = 100;
const EMPTY: PresenceSnapshot = { me: null, members: [] };

/**
 * Who is in the room and where their cursors are. Members reach React through
 * subscribe/getSnapshot; cursors change often, so they stay outside React and the
 * animation loop reads them through cursorOf and cursorVersion.
 */
export class Presence {
  private snapshot: PresenceSnapshot = EMPTY;
  private readonly cursors = new Map<string, { x: number; y: number }>();
  private readonly listeners = new Set<Listener>();
  private _cursorVersion = 0;
  private roomLink: BoardLink | null = null;
  private lastSendAt = -Infinity;
  /** True when the others last heard "no cursor" from this tab (or nothing yet). */
  private lastSentNull = true;
  private pending: [number, number] | null = null;

  /** Changes whenever a remote cursor appears, moves, or goes. */
  get cursorVersion(): number {
    return this._cursorVersion;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Same object until the members or `me` change. */
  getSnapshot = (): PresenceSnapshot => this.snapshot;

  handleWelcome(data: WelcomeData): void {
    this.clearCursors();
    this.setSnapshot({ me: data.you.memberId, members: data.members });
  }

  handlePresence(data: PresenceData): void {
    const present = new Set(data.members.map((m) => m.memberId));
    let dropped = false;
    for (const id of this.cursors.keys()) {
      if (!present.has(id)) dropped = this.cursors.delete(id) || dropped;
    }
    if (dropped) this._cursorVersion++;
    this.setSnapshot({ me: this.snapshot.me, members: data.members });
  }

  handleCursor(data: CursorData): void {
    if (data.memberId === this.snapshot.me) return;
    if (!this.snapshot.members.some((m) => m.memberId === data.memberId)) return;
    if (data.x === null || data.y === null) {
      if (this.cursors.delete(data.memberId)) this._cursorVersion++;
      return;
    }
    this.cursors.set(data.memberId, { x: data.x, y: data.y });
    this._cursorVersion++;
  }

  cursorOf(memberId: string): { x: number; y: number } | undefined {
    return this.cursors.get(memberId);
  }

  /** Not in a live room: nobody to show. */
  reset(): void {
    this.clearCursors();
    this.pending = null;
    if (this.snapshot !== EMPTY) this.setSnapshot(EMPTY);
  }

  /** Attaches the room connection, or detaches it with null. */
  link(link: BoardLink | null): void {
    this.roomLink = link;
    this.lastSendAt = -Infinity;
    this.lastSentNull = true;
    this.pending = null;
  }

  /**
   * This tab's pointer in board pixels, or null when it left the board. A point goes out at
   * most every 100 ms (the latest one wins); null goes out at once, and only once.
   */
  pointer(point: [number, number] | null, now: number): void {
    if (point === null) {
      this.pending = null;
      if (!this.lastSentNull && this.send(null, null)) {
        this.lastSentNull = true;
        this.lastSendAt = now;
      }
      return;
    }
    if (now - this.lastSendAt >= CURSOR_INTERVAL_MS) {
      this.pending = null;
      this.sendPoint(point, now);
    } else {
      this.pending = point;
    }
  }

  /** Called every animation frame: sends the pending point once 100 ms passed. */
  flush(now: number): void {
    if (!this.pending || now - this.lastSendAt < CURSOR_INTERVAL_MS) return;
    const point = this.pending;
    this.pending = null;
    this.sendPoint(point, now);
  }

  private sendPoint(point: [number, number], now: number): void {
    if (!this.send(point[0], point[1])) return;
    this.lastSendAt = now;
    this.lastSentNull = false;
  }

  private send(x: number | null, y: number | null): boolean {
    return this.roomLink?.send('cursor', { x, y }) ?? false;
  }

  private clearCursors(): void {
    if (this.cursors.size === 0) return;
    this.cursors.clear();
    this._cursorVersion++;
  }

  private setSnapshot(next: PresenceSnapshot): void {
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
}
