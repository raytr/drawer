import { BoardRoom } from './board-room';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const S1 = 'S'.repeat(21) + '1';
const S2 = 'S'.repeat(21) + '2';

function start(r: BoardRoom, who: string, id: string) {
  return r.apply(who, 'stroke.start', {
    strokeId: id,
    tool: 'b',
    color: '#111111',
    width: 8,
  });
}

describe('BoardRoom', () => {
  it('every accepted op takes the next seq; points are not echoed', () => {
    const r = new BoardRoom();
    expect(start(r, A, S1)).toEqual({
      kind: 'op',
      echo: true,
      op: {
        seq: 1,
        kind: 'stroke.start',
        strokeId: S1,
        tool: 'b',
        color: '#111111',
        width: 8,
      },
    });
    expect(
      r.apply(A, 'stroke.points', { strokeId: S1, n: 0, pts: [1, 2] }),
    ).toEqual({
      kind: 'op',
      echo: false,
      op: { seq: 2, kind: 'stroke.points', strokeId: S1, n: 0, pts: [1, 2] },
    });
    expect(r.apply(A, 'stroke.end', { strokeId: S1 })).toMatchObject({
      kind: 'op',
      echo: true,
      op: { seq: 3, kind: 'stroke.end', strokeId: S1 },
    });
    expect(r.seq).toBe(3);
  });

  it('a repeated batch number is ignored; a gap is bad-op', () => {
    const r = new BoardRoom();
    start(r, A, S1);
    r.apply(A, 'stroke.points', { strokeId: S1, n: 0, pts: [1, 2] });
    expect(
      r.apply(A, 'stroke.points', { strokeId: S1, n: 0, pts: [1, 2] }),
    ).toEqual({ kind: 'ignore' });
    expect(
      r.apply(A, 'stroke.points', { strokeId: S1, n: 2, pts: [3, 4] }),
    ).toEqual({
      kind: 'error',
      code: 'bad-op',
      ref: S1,
    });
    expect(r.welcomeFor(A)[0]).toMatchObject({ pts: [1, 2], batches: 1 });
    expect(r.seq).toBe(2);
  });

  it('points after the end are ignored; a stroke keeps at most 5,000 points', () => {
    const r = new BoardRoom();
    start(r, A, S1);
    const batch = new Array(128).fill(7);
    for (let n = 0; n < 80; n++)
      r.apply(A, 'stroke.points', { strokeId: S1, n, pts: batch });
    expect(r.welcomeFor(A)[0].pts).toHaveLength(10000);
    r.apply(A, 'stroke.end', { strokeId: S1 });
    expect(
      r.apply(A, 'stroke.points', { strokeId: S1, n: 80, pts: [1, 2] }),
    ).toEqual({ kind: 'ignore' });
  });

  it('only the author can add points, end, undo, or redo', () => {
    const r = new BoardRoom();
    start(r, A, S1);
    expect(r.apply(B, 'stroke.undo', { strokeId: S1 })).toEqual({
      kind: 'error',
      code: 'not-yours',
      ref: S1,
    });
    expect(
      r.apply(B, 'stroke.points', { strokeId: S1, n: 0, pts: [1, 2] }),
    ).toMatchObject({ code: 'not-yours' });
    expect(r.apply(B, 'stroke.end', { strokeId: S1 })).toMatchObject({
      code: 'not-yours',
    });
    expect(r.apply(B, 'stroke.redo', { strokeId: S1 })).toMatchObject({
      code: 'not-yours',
    });
  });

  it('a duplicate start, repeated end, undo, redo, and unknown strokes are ignored', () => {
    const r = new BoardRoom();
    start(r, A, S1);
    expect(start(r, A, S1)).toEqual({ kind: 'ignore' });
    expect(start(r, B, S1)).toEqual({ kind: 'ignore' });
    expect(r.apply(A, 'stroke.redo', { strokeId: S1 })).toEqual({
      kind: 'ignore',
    });
    expect(r.apply(A, 'stroke.undo', { strokeId: S1 })).toMatchObject({
      kind: 'op',
      op: { kind: 'stroke.undo' },
    });
    expect(r.apply(A, 'stroke.undo', { strokeId: S1 })).toEqual({
      kind: 'ignore',
    });
    expect(r.apply(A, 'stroke.redo', { strokeId: S1 })).toMatchObject({
      kind: 'op',
      op: { kind: 'stroke.redo' },
    });
    r.apply(A, 'stroke.end', { strokeId: S1 });
    expect(r.apply(A, 'stroke.end', { strokeId: S1 })).toEqual({
      kind: 'ignore',
    });
    expect(r.apply(A, 'stroke.undo', { strokeId: S2 })).toEqual({
      kind: 'ignore',
    });
    expect(
      r.apply(A, 'stroke.points', { strokeId: S2, n: 0, pts: [1, 2] }),
    ).toEqual({ kind: 'ignore' });
  });

  it('welcomeFor marks mine; toFile(true) drops deleted strokes; a file round-trips', () => {
    const r = new BoardRoom();
    start(r, A, S1);
    start(r, B, S2);
    r.apply(B, 'stroke.undo', { strokeId: S2 });
    expect(r.welcomeFor(A).map((s) => [s.id, s.mine])).toEqual([
      [S1, true],
      [S2, false],
    ]);
    expect(r.welcomeFor(A)[0]).not.toHaveProperty('author');
    expect(r.toFile(false).strokes.map((s) => s.id)).toEqual([S1, S2]);
    const file = r.toFile(true);
    expect(file.strokes.map((s) => s.id)).toEqual([S1]);
    const loaded = new BoardRoom(file);
    expect(loaded.seq).toBe(r.seq);
    expect(loaded.welcomeFor(A)).toEqual([r.welcomeFor(A)[0]]);
    expect(loaded.apply(B, 'stroke.end', { strokeId: S1 })).toMatchObject({
      code: 'not-yours',
    });
  });

  it('endAllUnfinished ends only that author when given, or everyone', () => {
    const r = new BoardRoom();
    start(r, A, S1);
    start(r, B, S2);
    expect(r.endAllUnfinished(A)).toEqual([
      { seq: 3, kind: 'stroke.end', strokeId: S1 },
    ]);
    expect(r.welcomeFor(A).map((s) => s.done)).toEqual([true, false]);
    expect(r.endAllUnfinished().map((o) => o.strokeId)).toEqual([S2]);
    expect(r.endAllUnfinished()).toEqual([]);
  });

  it('dirty is set by accepted ops only and cleared by markClean', () => {
    const r = new BoardRoom();
    expect(r.dirty).toBe(false);
    start(r, A, S1);
    expect(r.dirty).toBe(true);
    r.markClean();
    start(r, A, S1);
    r.apply(B, 'stroke.end', { strokeId: S1 });
    expect(r.dirty).toBe(false);
  });
});
