import { BoardStore } from './board-store';
import { History } from './history';
import { newStrokeId } from './ids';
import { PointBatcher } from './point-batcher';
import type { OpEvent, WelcomeData } from './protocol';
import { MAX_POINTS_PER_BATCH, type Stroke, type Tool } from './types';

export interface BoardSnapshot {
  canUndo: boolean;
  canRedo: boolean;
  hasVisible: boolean;
  drawing: boolean;
}

type Listener = () => void;

/** The room side of the controller: sends one message, returns false when it could not. */
export interface BoardLink {
  send(event: string, data: object): boolean;
}

/** Spec 9.3: at most one stroke.points message every 50 ms while drawing. */
const POINTS_INTERVAL_MS = 50;

/** The one object React talks to. It owns the store, the history, and the active stroke. */
export class BoardController {
  readonly store: BoardStore;
  private readonly history: History;
  private readonly newId: () => string;
  private readonly batcher = new PointBatcher();
  private activeId: string | null = null;
  private roomLink: BoardLink | null = null;
  private welcomed = false;
  private lastPointsSend = -Infinity;
  /** Per own stroke: numbers of `pts` the server has accepted, and the next batch number. */
  private readonly progress = new Map<string, { sent: number; n: number }>();
  private listeners = new Set<Listener>();
  private snapshot: BoardSnapshot = { canUndo: false, canRedo: false, hasVisible: false, drawing: false };

  constructor(store?: BoardStore, history?: History, newId: () => string = newStrokeId) {
    this.store = store ?? new BoardStore();
    this.history = history ?? new History(this.store);
    this.newId = newId;
    this.store.subscribe(this.emit);
    this.history.subscribe(this.emit);
    this.history.onApply = (entry, undo) => {
      if (entry.kind === 'stroke') this.send(undo ? 'stroke.undo' : 'stroke.redo', { strokeId: entry.id });
    };
  }

  get inRoom(): boolean {
    return this.roomLink !== null;
  }

  /** Attaches the room connection, or detaches it with null. */
  link(link: BoardLink | null): void {
    this.roomLink = link;
    this.welcomed = false;
    this.progress.clear();
  }

  get drawing(): boolean {
    return this.activeId !== null;
  }

  beginStroke(tool: Tool, color: string, width: number): void {
    if (this.drawing) return;
    const id = this.newId();
    this.batcher.reset();
    this.activeId = id;
    this.store.startStroke({ id, tool, color, width });
    if (this.roomLink) {
      this.progress.set(id, { sent: 0, n: 0 });
      this.lastPointsSend = -Infinity;
      this.send('stroke.start', { strokeId: id, tool, color, width });
    }
  }

  addPoint(x: number, y: number): void {
    if (this.drawing) this.batcher.add(x, y);
  }

  /**
   * Moves at most one batch into the store. Called once per animation frame.
   * In a room it also sends the unsent points, at most every 50 ms.
   */
  flush(now = performance.now()): void {
    const id = this.activeId;
    if (id === null) return;
    if (this.batcher.hasPending()) this.store.appendPoints(id, this.batcher.take());
    if (this.roomLink && now - this.lastPointsSend >= POINTS_INTERVAL_MS) {
      const stroke = this.store.get(id);
      if (stroke && this.sendPoints(stroke)) this.lastPointsSend = now;
    }
  }

  endStroke(): void {
    const id = this.activeId;
    if (id === null) return;
    while (this.batcher.hasPending()) this.store.appendPoints(id, this.batcher.take());
    this.activeId = null;
    this.store.endStroke(id);
    this.history.recordStroke(id);
    const stroke = this.store.get(id);
    if (this.roomLink && stroke) {
      this.sendPoints(stroke);
      this.send('stroke.end', { strokeId: id });
    }
  }

  undo(): void {
    if (!this.drawing) this.history.undo();
  }

  redo(): void {
    if (!this.drawing) this.history.redo();
  }

  /** In a room only the owner may clear (M4), so it does nothing there for now. */
  clear(): void {
    if (!this.drawing && !this.roomLink) this.history.clear();
  }

  /**
   * Takes the board from a welcome, then resends by state what the server lacks (spec 9.6):
   * start for own strokes it does not have, points from its count on, end, and undo or redo.
   * Only the first welcome after link() rebuilds the undo stack (a reload or a Share);
   * a reconnect keeps the undo and redo stacks.
   */
  handleWelcome(data: WelcomeData): void {
    this.store.loadWelcome(data.strokes);
    const own = this.store.ordered().filter((s) => s.mine);
    if (!this.welcomed) {
      this.welcomed = true;
      this.history.rebuild(own.filter((s) => !s.deleted).map((s) => s.id));
    }
    const server = new Map(data.strokes.map((w) => [w.id, w]));
    for (const stroke of own) {
      const w = server.get(stroke.id);
      if (w) {
        this.progress.set(stroke.id, { sent: Math.min(w.pts.length, stroke.pts.length), n: w.batches });
      } else {
        this.progress.set(stroke.id, { sent: 0, n: 0 });
        const { tool, color, width } = stroke;
        this.send('stroke.start', { strokeId: stroke.id, tool, color, width });
      }
      this.sendPoints(stroke);
      if (stroke.done && !w?.done) this.send('stroke.end', { strokeId: stroke.id });
      if (stroke.deleted !== (w?.deleted ?? false)) {
        this.send(stroke.deleted ? 'stroke.undo' : 'stroke.redo', { strokeId: stroke.id });
      }
    }
  }

  handleOp(op: OpEvent): void {
    this.store.applyOp(op);
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Returns the same object until one of its values changes, so React does not re-render per point. */
  getSnapshot = (): BoardSnapshot => {
    const next: BoardSnapshot = {
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      hasVisible: this.store.visibleIds().length > 0,
      drawing: this.drawing,
    };
    const prev = this.snapshot;
    if (
      prev.canUndo !== next.canUndo ||
      prev.canRedo !== next.canRedo ||
      prev.hasVisible !== next.hasVisible ||
      prev.drawing !== next.drawing
    ) {
      this.snapshot = next;
    }
    return this.snapshot;
  };

  /** Sends the points of an own stroke that the server does not have yet. True if any were sent. */
  private sendPoints(stroke: Stroke): boolean {
    const p = this.progress.get(stroke.id);
    if (!p) return false;
    let any = false;
    while (p.sent < stroke.pts.length) {
      const pts = stroke.pts.slice(p.sent, p.sent + MAX_POINTS_PER_BATCH * 2);
      if (!this.send('stroke.points', { strokeId: stroke.id, n: p.n, pts })) break;
      p.sent += pts.length;
      p.n++;
      any = true;
    }
    return any;
  }

  private send(event: string, data: object): boolean {
    return this.roomLink?.send(event, data) ?? false;
  }

  private emit = (): void => {
    for (const listener of this.listeners) listener();
  };
}
