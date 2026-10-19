import { MAX_POINTS_PER_STROKE, type Stroke, type Tool } from './types';

type Listener = () => void;

/** Holds every stroke of the board. React never stores strokes; it subscribes here. */
export class BoardStore {
  private strokes = new Map<string, Stroke>();
  private order: string[] = [];
  private listeners = new Set<Listener>();
  private nextLocalOrder = 0;
  private _version = 0;
  private _structureVersion = 0;

  get version(): number {
    return this._version;
  }

  /** Changes only when a stroke is hidden or shown again. */
  get structureVersion(): number {
    return this._structureVersion;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  startStroke(init: { id: string; tool: Tool; color: string; width: number }): Stroke {
    const stroke: Stroke = {
      ...init,
      seq: null,
      localOrder: this.nextLocalOrder++,
      pts: [],
      done: false,
      deleted: false,
      mine: true,
    };
    this.strokes.set(stroke.id, stroke);
    this.order.push(stroke.id);
    this.changed();
    return stroke;
  }

  appendPoints(id: string, pts: number[]): void {
    const stroke = this.strokes.get(id);
    if (!stroke || stroke.done) return;
    const room = MAX_POINTS_PER_STROKE * 2 - stroke.pts.length;
    if (room <= 0) return;
    const accepted = pts.length > room ? pts.slice(0, room) : pts;
    if (accepted.length === 0) return;
    stroke.pts.push(...accepted);
    this.changed();
  }

  endStroke(id: string): void {
    const stroke = this.strokes.get(id);
    if (!stroke || stroke.done) return;
    stroke.done = true;
    this.changed();
  }

  setDeleted(ids: readonly string[], deleted: boolean): void {
    let any = false;
    for (const id of ids) {
      const stroke = this.strokes.get(id);
      if (stroke && stroke.deleted !== deleted) {
        stroke.deleted = deleted;
        any = true;
      }
    }
    if (!any) return;
    this._structureVersion++;
    this.changed();
  }

  visibleIds(): string[] {
    return this.order.filter((id) => !this.strokes.get(id)!.deleted);
  }

  ordered(): readonly Stroke[] {
    return this.order.map((id) => this.strokes.get(id)!);
  }

  get(id: string): Stroke | undefined {
    return this.strokes.get(id);
  }

  private changed(): void {
    this._version++;
    for (const listener of this.listeners) listener();
  }
}
