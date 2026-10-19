import { BoardStore } from './board-store';
import { History } from './history';
import { newStrokeId } from './ids';
import { PointBatcher } from './point-batcher';
import type { Tool } from './types';

export interface BoardSnapshot {
  canUndo: boolean;
  canRedo: boolean;
  hasVisible: boolean;
  drawing: boolean;
}

type Listener = () => void;

/** The one object React talks to. It owns the store, the history, and the active stroke. */
export class BoardController {
  readonly store: BoardStore;
  private readonly history: History;
  private readonly newId: () => string;
  private readonly batcher = new PointBatcher();
  private activeId: string | null = null;
  private listeners = new Set<Listener>();
  private snapshot: BoardSnapshot = { canUndo: false, canRedo: false, hasVisible: false, drawing: false };

  constructor(store?: BoardStore, history?: History, newId: () => string = newStrokeId) {
    this.store = store ?? new BoardStore();
    this.history = history ?? new History(this.store);
    this.newId = newId;
    this.store.subscribe(this.emit);
    this.history.subscribe(this.emit);
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
  }

  addPoint(x: number, y: number): void {
    if (this.drawing) this.batcher.add(x, y);
  }

  /** Moves at most one batch into the store. Called once per animation frame. */
  flush(): void {
    if (this.activeId === null || !this.batcher.hasPending()) return;
    this.store.appendPoints(this.activeId, this.batcher.take());
  }

  endStroke(): void {
    const id = this.activeId;
    if (id === null) return;
    while (this.batcher.hasPending()) this.store.appendPoints(id, this.batcher.take());
    this.activeId = null;
    this.store.endStroke(id);
    this.history.recordStroke(id);
  }

  undo(): void {
    if (!this.drawing) this.history.undo();
  }

  redo(): void {
    if (!this.drawing) this.history.redo();
  }

  clear(): void {
    if (!this.drawing) this.history.clear();
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

  private emit = (): void => {
    for (const listener of this.listeners) listener();
  };
}
