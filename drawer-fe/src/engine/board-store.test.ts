import type { OpEvent, WelcomeStroke } from './protocol';
import { BoardStore } from './board-store';

test('startStroke creates a pending stroke of this tab', () => {
  const s = new BoardStore();
  const a = s.startStroke({ id: 'a', tool: 'b', color: '#111111', width: 8 });
  expect(a).toMatchObject({ seq: null, done: false, deleted: false, mine: true, pts: [] });
  s.startStroke({ id: 'b', tool: 'e', color: '#111111', width: 8 });
  expect(s.ordered().map((x) => x.id)).toEqual(['a', 'b']);
});

test('appendPoints ignores unknown and finished strokes', () => {
  const s = new BoardStore();
  s.startStroke({ id: 'a', tool: 'b', color: '#111111', width: 8 });
  s.appendPoints('nope', [1, 2]);
  s.appendPoints('a', [1, 2, 3, 4]);
  s.endStroke('a');
  s.appendPoints('a', [5, 6]);
  expect(s.get('a')!.pts).toEqual([1, 2, 3, 4]);
  expect(s.get('a')!.done).toBe(true);
});

test('a stroke keeps at most 5000 points', () => {
  const s = new BoardStore();
  s.startStroke({ id: 'a', tool: 'b', color: '#111111', width: 8 });
  for (let i = 0; i < 80; i++) s.appendPoints('a', new Array(128).fill(1)); // 80 x 64 points
  expect(s.get('a')!.pts.length).toBe(10000);
  s.endStroke('a');
  expect(s.get('a')!.done).toBe(true);
});

test('setDeleted and visibleIds; structureVersion moves only on deleted changes', () => {
  const s = new BoardStore();
  s.startStroke({ id: 'a', tool: 'b', color: '#111111', width: 8 });
  s.startStroke({ id: 'b', tool: 'b', color: '#111111', width: 8 });
  const v = s.structureVersion;
  s.appendPoints('a', [1, 2]);
  expect(s.structureVersion).toBe(v);
  s.setDeleted(['a'], true);
  expect(s.structureVersion).toBe(v + 1);
  expect(s.visibleIds()).toEqual(['b']);
});

test('subscribers are called on change and can unsubscribe', () => {
  const s = new BoardStore();
  const fn = vi.fn();
  const off = s.subscribe(fn);
  s.startStroke({ id: 'a', tool: 'b', color: '#111111', width: 8 });
  off();
  s.endStroke('a');
  expect(fn).toHaveBeenCalledTimes(1);
});

describe('in a room', () => {
  const op = (o: Partial<OpEvent>): OpEvent => ({
    seq: 1,
    by: 'm',
    kind: 'stroke.start',
    strokeId: 'x',
    tool: 'b',
    color: '#111111',
    width: 8,
    ...o,
  });
  const w = (o: Partial<WelcomeStroke>): WelcomeStroke => ({
    id: 'x',
    seq: 1,
    tool: 'b',
    color: '#111111',
    width: 8,
    pts: [],
    batches: 0,
    done: false,
    deleted: false,
    mine: false,
    ...o,
  });

  test('ordered() puts seq strokes first, by seq', () => {
    const s = new BoardStore();
    s.startStroke({ id: 'mine', tool: 'b', color: '#111111', width: 8 });
    s.applyOp(op({ seq: 7, strokeId: 'late' }));
    s.applyOp(op({ seq: 3, strokeId: 'early' }));
    expect(s.ordered().map((x) => x.id)).toEqual(['early', 'late', 'mine']);
    s.applyOp(op({ seq: 5, strokeId: 'mine' }));
    expect(s.ordered().map((x) => x.id)).toEqual(['early', 'mine', 'late']);
    expect(s.visibleIds()).toEqual(['early', 'mine', 'late']);
  });

  test('remote points, end, undo, redo', () => {
    const s = new BoardStore();
    s.applyOp(op({ strokeId: 'r', color: '#e03131', width: 4 }));
    s.applyOp(op({ seq: 2, kind: 'stroke.points', strokeId: 'r', n: 0, pts: [1, 2] }));
    s.applyOp(op({ seq: 3, kind: 'stroke.end', strokeId: 'r' }));
    s.applyOp(op({ seq: 4, kind: 'stroke.undo', strokeId: 'r' }));
    expect(s.get('r')).toMatchObject({ mine: false, seq: 1, color: '#e03131', width: 4, pts: [1, 2], done: true, deleted: true });
    const v = s.structureVersion;
    s.applyOp(op({ seq: 5, kind: 'stroke.redo', strokeId: 'r' }));
    expect(s.get('r')!.deleted).toBe(false);
    expect(s.structureVersion).toBe(v + 1);
    s.applyOp(op({ seq: 6, kind: 'stroke.points', strokeId: 'unknown', n: 0, pts: [1, 2] }));
    expect(s.get('unknown')).toBeUndefined();
  });

  test('echoes of my own end, undo, and redo do not change local state', () => {
    const s = new BoardStore();
    s.startStroke({ id: 'm', tool: 'b', color: '#111111', width: 8 });
    s.applyOp(op({ seq: 1, strokeId: 'm' }));
    s.setDeleted(['m'], true);
    s.setDeleted(['m'], false);
    s.applyOp(op({ seq: 2, kind: 'stroke.undo', strokeId: 'm' }));
    expect(s.get('m')).toMatchObject({ seq: 1, deleted: false, done: false });
  });

  test('loadWelcome keeps local mine state, replaces remote strokes, keeps unsent local strokes', () => {
    const s = new BoardStore();
    s.startStroke({ id: 'm1', tool: 'b', color: '#111111', width: 8 });
    s.appendPoints('m1', [5, 5]);
    s.startStroke({ id: 'm2', tool: 'b', color: '#111111', width: 8 });
    s.applyOp(op({ seq: 1, strokeId: 'gone' }));
    s.applyOp(op({ seq: 2, strokeId: 'r1' }));
    const v = s.structureVersion;
    s.loadWelcome([
      w({ id: 'm1', seq: 2, mine: true }),
      w({ id: 'r1', seq: 3, color: '#e03131', width: 4, pts: [9, 9], batches: 1, done: true }),
    ]);
    expect(s.ordered().map((x) => [x.id, x.seq])).toEqual([
      ['m1', 2],
      ['r1', 3],
      ['m2', null],
    ]);
    expect(s.get('m1')!.pts).toEqual([5, 5]);
    expect(s.get('r1')).toMatchObject({ color: '#e03131', pts: [9, 9], done: true, mine: false });
    expect(s.get('gone')).toBeUndefined();
    expect(s.structureVersion).toBe(v + 1);
  });

  test('loadWelcome adds my strokes from the server and resets the seq of mine it lacks', () => {
    const s = new BoardStore();
    s.startStroke({ id: 'm1', tool: 'b', color: '#111111', width: 8 });
    s.applyOp(op({ seq: 4, strokeId: 'm1' }));
    s.loadWelcome([w({ id: 'old', seq: 1, mine: true, pts: [1, 1], done: true })]);
    expect(s.ordered().map((x) => [x.id, x.seq, x.mine])).toEqual([
      ['old', 1, true],
      ['m1', null, true],
    ]);
  });

  test('adoptAllAsLocal turns visible strokes into pending own strokes, keeping their order', () => {
    const s = new BoardStore();
    s.startStroke({ id: 'p', tool: 'b', color: '#111111', width: 8 });
    s.applyOp(op({ seq: 1, strokeId: 'r' }));
    s.applyOp(op({ seq: 2, strokeId: 'd' }));
    s.applyOp(op({ seq: 3, kind: 'stroke.undo', strokeId: 'd' }));
    s.adoptAllAsLocal();
    expect(s.ordered().map((x) => [x.id, x.seq, x.mine, x.done])).toEqual([
      ['r', null, true, true],
      ['p', null, true, true],
    ]);
    expect(s.get('d')).toBeUndefined();
  });
});
