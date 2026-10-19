import type { StoredStroke, StrokesFile } from '../rooms/room-files';
import type { StrokePointsDto, StrokeRefDto, StrokeStartDto } from './messages';
import type { ErrorCode, OpEvent, OpKind, WelcomeStroke } from './protocol';

const MAX_NUMBERS_PER_STROKE = 5000 * 2;

export type RoomOp = Omit<OpEvent, 'by'>;

export type ApplyResult =
  | { kind: 'op'; op: RoomOp; echo: boolean }
  | { kind: 'ignore' }
  | { kind: 'error'; code: ErrorCode; ref?: string };

const IGNORE: ApplyResult = { kind: 'ignore' };

/**
 * The strokes of one room and the rules for changing them (spec 8.3). No I/O.
 * Every accepted op takes the next seq. Repeats are ignored, so a client can resend safely.
 */
export class BoardRoom {
  /** Insertion order is start order, which is seq order. */
  private readonly strokes = new Map<string, StoredStroke>();
  private _seq = 0;
  private _dirty = false;

  constructor(file?: StrokesFile) {
    if (!file) return;
    this._seq = file.seq;
    for (const s of [...file.strokes].sort((a, b) => a.seq - b.seq))
      this.strokes.set(s.id, s);
  }

  get seq(): number {
    return this._seq;
  }

  /** True when something changed since the last markClean. */
  get dirty(): boolean {
    return this._dirty;
  }

  markClean(): void {
    this._dirty = false;
  }

  apply(
    author: string,
    kind: OpKind,
    data: StrokeStartDto | StrokePointsDto | StrokeRefDto,
  ): ApplyResult {
    if (kind === 'stroke.start')
      return this.start(author, data as StrokeStartDto);
    const stroke = this.strokes.get(data.strokeId);
    if (!stroke) return IGNORE;
    if (stroke.author !== author)
      return { kind: 'error', code: 'not-yours', ref: stroke.id };
    switch (kind) {
      case 'stroke.points':
        return this.points(stroke, data as StrokePointsDto);
      case 'stroke.end':
        if (stroke.done) return IGNORE;
        stroke.done = true;
        return this.accept({ kind, strokeId: stroke.id }, true);
      case 'stroke.undo':
      case 'stroke.redo': {
        const deleted = kind === 'stroke.undo';
        if (stroke.deleted === deleted) return IGNORE;
        stroke.deleted = deleted;
        return this.accept({ kind, strokeId: stroke.id }, true);
      }
    }
  }

  welcomeFor(author: string): WelcomeStroke[] {
    return [...this.strokes.values()].map(({ author: by, ...rest }) => ({
      ...rest,
      mine: by === author,
    }));
  }

  /** Ends every unfinished stroke of the author (or of everyone) and returns one stroke.end op for each. */
  endAllUnfinished(author?: string): RoomOp[] {
    const ops: RoomOp[] = [];
    for (const stroke of this.strokes.values()) {
      if (stroke.done || (author !== undefined && stroke.author !== author))
        continue;
      stroke.done = true;
      const result = this.accept(
        { kind: 'stroke.end', strokeId: stroke.id },
        true,
      );
      if (result.kind === 'op') ops.push(result.op);
    }
    return ops;
  }

  /** `compact` drops deleted strokes; used when the room is unloaded. */
  toFile(compact: boolean): StrokesFile {
    const strokes = [...this.strokes.values()].filter(
      (s) => !compact || !s.deleted,
    );
    return { v: 1, seq: this._seq, strokes };
  }

  private start(author: string, d: StrokeStartDto): ApplyResult {
    if (this.strokes.has(d.strokeId)) return IGNORE;
    const seq = this._seq + 1;
    this.strokes.set(d.strokeId, {
      id: d.strokeId,
      seq,
      author,
      tool: d.tool,
      color: d.color,
      width: d.width,
      pts: [],
      batches: 0,
      done: false,
      deleted: false,
    });
    return this.accept(
      {
        kind: 'stroke.start',
        strokeId: d.strokeId,
        tool: d.tool,
        color: d.color,
        width: d.width,
      },
      true,
    );
  }

  private points(stroke: StoredStroke, d: StrokePointsDto): ApplyResult {
    if (stroke.done || d.n < stroke.batches) return IGNORE;
    if (d.n > stroke.batches)
      return { kind: 'error', code: 'bad-op', ref: stroke.id };
    const room = Math.max(0, MAX_NUMBERS_PER_STROKE - stroke.pts.length);
    const pts = d.pts.length > room ? d.pts.slice(0, room) : d.pts;
    stroke.pts.push(...pts);
    stroke.batches++;
    return this.accept(
      { kind: 'stroke.points', strokeId: stroke.id, n: d.n, pts },
      false,
    );
  }

  private accept(op: Omit<RoomOp, 'seq'>, echo: boolean): ApplyResult {
    this._seq++;
    this._dirty = true;
    return { kind: 'op', op: { seq: this._seq, ...op }, echo };
  }
}
