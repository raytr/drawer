import type { BoardStore } from './board-store';

export type HistoryEntry = { kind: 'stroke'; id: string } | { kind: 'clear'; ids: string[] };

type Listener = () => void;

/** Undo and redo for the actions of this tab: its own strokes and its clears. */
export class History {
  private readonly store: BoardStore;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private listeners = new Set<Listener>();
  private _version = 0;

  constructor(store: BoardStore) {
    this.store = store;
  }

  get version(): number {
    return this._version;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  recordStroke(id: string): void {
    this.push({ kind: 'stroke', id });
  }

  /** Hides every visible stroke. In M2 this becomes the board.clear op. */
  clear(): void {
    const ids = this.store.visibleIds();
    if (ids.length === 0) return;
    this.store.setDeleted(ids, true);
    this.push({ kind: 'clear', ids });
  }

  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.apply(entry, true);
    this.redoStack.push(entry);
    this.changed();
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.apply(entry, false);
    this.undoStack.push(entry);
    this.changed();
    return true;
  }

  private push(entry: HistoryEntry): void {
    this.undoStack.push(entry);
    this.redoStack = [];
    this.changed();
  }

  /** Undo of a stroke hides it; undo of a clear shows exactly the cleared strokes again. */
  private apply(entry: HistoryEntry, undo: boolean): void {
    if (entry.kind === 'stroke') this.store.setDeleted([entry.id], undo);
    else this.store.setDeleted(entry.ids, !undo);
  }

  private changed(): void {
    this._version++;
    for (const listener of this.listeners) listener();
  }
}
