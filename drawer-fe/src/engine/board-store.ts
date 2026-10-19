import type { OpEvent, WelcomeStroke } from './protocol';
import { MAX_POINTS_PER_STROKE, type Stroke, type Tool } from './types';

type Listener = () => void;

/** Strokes with a seq first, by seq; then pending strokes, by creation order in this tab. */
function compare(a: Stroke, b: Stroke): number {
  if (a.seq !== null && b.seq !== null) return a.seq - b.seq;
  if (a.seq !== null) return -1;
  if (b.seq !== null) return 1;
  return a.localOrder - b.localOrder;
}

/**
 * Holds every stroke of the board. React never stores strokes; it subscribes here.
 * `order` is kept sorted on each change, because the renderer reads it every frame.
 */
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

  /** Applies a server op. For this tab's own strokes only the seq is taken: local state is newer. */
  applyOp(op: OpEvent): void {
    const stroke = this.strokes.get(op.strokeId);
    if (op.kind === 'stroke.start') {
      if (stroke) {
        if (stroke.seq !== null) return;
        stroke.seq = op.seq;
        this.reposition(stroke.id);
      } else {
        this.add({
          id: op.strokeId,
          seq: op.seq,
          localOrder: this.nextLocalOrder++,
          tool: op.tool === 'e' ? 'e' : 'b',
          color: op.color ?? '#000000',
          width: op.width ?? 1,
          pts: [],
          done: false,
          deleted: false,
          mine: false,
        });
      }
      this.changed();
      return;
    }
    if (!stroke || stroke.mine) return;
    if (op.kind === 'stroke.points') this.appendPoints(stroke.id, op.pts ?? []);
    else if (op.kind === 'stroke.end') this.endStroke(stroke.id);
    else this.setDeleted([stroke.id], op.kind === 'stroke.undo');
  }

  /**
   * Takes the board from a `welcome`. Other users' strokes are replaced by the server copy.
   * This tab's own strokes keep their local state (it can hold points the server lacks) and take
   * the seq, unless the server already ended them; own strokes the server lacks become pending
   * again, so they get a new seq.
   */
  loadWelcome(strokes: readonly WelcomeStroke[]): void {
    const incoming = new Map(strokes.map((w) => [w.id, w]));
    for (const [id, s] of this.strokes) {
      if (incoming.has(id)) continue;
      if (s.mine) s.seq = null;
      else this.strokes.delete(id);
    }
    for (const w of strokes) {
      const local = this.strokes.get(w.id);
      if (local?.mine) {
        local.seq = w.seq;
        // The server ended this stroke (its author was away 30 s) and ignores any later
        // points: take its copy, so this tab shows what everyone else sees.
        if (w.done && (!local.done || local.pts.length > w.pts.length)) {
          local.pts = w.pts.slice();
          local.done = true;
        }
        continue;
      }
      this.strokes.set(w.id, {
        id: w.id,
        seq: w.seq,
        localOrder: local?.localOrder ?? this.nextLocalOrder++,
        tool: w.tool,
        color: w.color,
        width: w.width,
        pts: w.pts.slice(),
        done: w.done,
        deleted: w.deleted,
        mine: w.mine,
      });
    }
    this.sortAll();
    this._structureVersion++;
    this.changed();
  }

  /** After a room expired: keep the visible drawing as finished local strokes of this tab. */
  adoptAllAsLocal(): void {
    const kept = this.ordered().filter((s) => !s.deleted);
    this.strokes.clear();
    for (const s of kept) {
      this.strokes.set(s.id, { ...s, seq: null, done: true, mine: true, localOrder: this.nextLocalOrder++ });
    }
    this.sortAll();
    this._structureVersion++;
    this.changed();
  }

  private add(stroke: Stroke): void {
    this.strokes.set(stroke.id, stroke);
    this.insertSorted(stroke.id);
  }

  private reposition(id: string): void {
    this.order.splice(this.order.indexOf(id), 1);
    this.insertSorted(id);
  }

  private insertSorted(id: string): void {
    const stroke = this.strokes.get(id)!;
    let i = this.order.length;
    while (i > 0 && compare(this.strokes.get(this.order[i - 1])!, stroke) > 0) i--;
    this.order.splice(i, 0, id);
  }

  private sortAll(): void {
    this.order = [...this.strokes.values()].sort(compare).map((s) => s.id);
  }

  private changed(): void {
    this._version++;
    for (const listener of this.listeners) listener();
  }
}
