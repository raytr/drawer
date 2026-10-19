import type { WelcomeData } from './protocol';
import { BoardController } from './board-controller';

const ids = () => { let n = 0; return () => `s${++n}`; };

test('a full stroke ends in the store and in history', () => {
  const c = new BoardController(undefined, undefined, ids());
  c.beginStroke('b', '#111111', 8);
  c.addPoint(1, 1); c.addPoint(2, 2);
  c.flush();
  c.addPoint(3, 3);
  c.endStroke();
  expect(c.store.get('s1')).toMatchObject({ pts: [1, 1, 2, 2, 3, 3], done: true });
  expect(c.getSnapshot()).toMatchObject({ canUndo: true, hasVisible: true, drawing: false });
});

test('undo, redo, and clear are ignored while drawing', () => {
  const c = new BoardController(undefined, undefined, ids());
  c.beginStroke('b', '#111111', 8); c.addPoint(1, 1); c.endStroke();
  c.beginStroke('b', '#111111', 8); c.addPoint(5, 5);
  c.undo(); c.clear();
  expect(c.store.visibleIds()).toEqual(['s1', 's2']);
  c.endStroke();
  c.undo();
  expect(c.store.visibleIds()).toEqual(['s1']);
});

test('getSnapshot keeps its identity until a change', () => {
  const c = new BoardController(undefined, undefined, ids());
  const a = c.getSnapshot();
  expect(c.getSnapshot()).toBe(a);
  c.beginStroke('b', '#111111', 8);
  expect(c.getSnapshot()).not.toBe(a);
  expect(c.getSnapshot().drawing).toBe(true);
});

test('adding points does not create a new snapshot (no React re-render per point)', () => {
  const c = new BoardController(undefined, undefined, ids());
  c.beginStroke('b', '#111111', 8);
  c.addPoint(1, 1); c.flush();
  const a = c.getSnapshot();
  c.addPoint(2, 2); c.flush();
  expect(c.getSnapshot()).toBe(a);
});

test('stroke ids work without crypto.randomUUID (plain http on a LAN address)', () => {
  const original = crypto.randomUUID;
  // @ts-expect-error simulate a non-secure context
  crypto.randomUUID = undefined;
  try {
    const c = new BoardController();
    c.beginStroke('b', '#111111', 8);
    const [stroke] = c.store.ordered();
    expect(stroke.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
  } finally {
    crypto.randomUUID = original;
  }
});

describe('in a room', () => {
  type Sent = [string, Record<string, unknown>];
  function recorder() {
    const sent: Sent[] = [];
    let up = true;
    return {
      sent,
      setUp(value: boolean) {
        up = value;
      },
      link: {
        send(event: string, data: object) {
          if (!up) return false;
          sent.push([event, data as Record<string, unknown>]);
          return true;
        },
      },
    };
  }
  const empty: WelcomeData = { seq: 0, you: { memberId: 'm', isOwner: false }, strokes: [] };
  const points = (from: number, count: number) => {
    const pts: number[] = [];
    for (let i = 0; i < count; i++) pts.push(from + i, from + i);
    return pts;
  };
  const add = (c: BoardController, pts: number[]) => {
    for (let i = 0; i < pts.length; i += 2) c.addPoint(pts[i], pts[i + 1]);
  };
  const kinds = (sent: Sent[]) => sent.map(([e, d]) => (e === 'stroke.points' ? `${e} ${d.n} ${(d.pts as number[]).length / 2}` : e));

  test('sends start, points at most every 50 ms in batches of at most 64, then end', () => {
    const r = recorder();
    const c = new BoardController(undefined, undefined, ids());
    c.link(r.link);
    expect(c.inRoom).toBe(true);
    c.beginStroke('b', '#e03131', 8);
    expect(r.sent).toEqual([['stroke.start', { strokeId: 's1', tool: 'b', color: '#e03131', width: 8 }]]);
    add(c, points(0, 70));
    c.flush(0);
    c.flush(20);
    add(c, points(100, 3));
    c.flush(60);
    add(c, points(200, 1));
    c.endStroke();
    expect(kinds(r.sent)).toEqual([
      'stroke.start',
      'stroke.points 0 64',
      'stroke.points 1 9',
      'stroke.points 2 1',
      'stroke.end',
    ]);
    const all = r.sent.filter(([e]) => e === 'stroke.points').flatMap(([, d]) => d.pts as number[]);
    expect(all).toEqual(c.store.get('s1')!.pts);
    expect(r.sent[1][1]).toMatchObject({ strokeId: 's1', n: 0 });
  });

  test('undo in a room sends stroke.undo, redo sends stroke.redo; clear does nothing', () => {
    const r = recorder();
    const c = new BoardController(undefined, undefined, ids());
    c.link(r.link);
    c.beginStroke('b', '#111111', 8);
    c.addPoint(1, 1);
    c.endStroke();
    c.undo();
    c.redo();
    expect(r.sent.slice(-2)).toEqual([
      ['stroke.undo', { strokeId: 's1' }],
      ['stroke.redo', { strokeId: 's1' }],
    ]);
    c.clear();
    expect(c.store.visibleIds()).toEqual(['s1']);
  });

  test('welcome resends only the points the server lacks', () => {
    const r = recorder();
    const c = new BoardController(undefined, undefined, ids());
    c.link(r.link);
    c.handleWelcome(empty);
    c.beginStroke('b', '#111111', 8);
    add(c, points(0, 3));
    c.flush(0);
    add(c, points(10, 3));
    c.flush(60);
    r.setUp(false);
    add(c, points(20, 3));
    c.endStroke();
    r.sent.length = 0;
    r.setUp(true);
    c.handleWelcome({
      ...empty,
      seq: 2,
      strokes: [{ id: 's1', seq: 1, tool: 'b', color: '#111111', width: 8, pts: points(0, 3), batches: 1, done: false, deleted: false, mine: true }],
    });
    expect(r.sent).toEqual([
      ['stroke.points', { strokeId: 's1', n: 1, pts: [...points(10, 3), ...points(20, 3)] }],
      ['stroke.end', { strokeId: 's1' }],
    ]);
    expect(c.store.get('s1')!.seq).toBe(1);
  });

  test('welcome replays strokes drawn before sharing', () => {
    const r = recorder();
    const c = new BoardController(undefined, undefined, ids());
    c.beginStroke('b', '#111111', 8);
    c.addPoint(1, 1);
    c.endStroke();
    c.beginStroke('e', '#111111', 4);
    c.addPoint(2, 2);
    c.endStroke();
    c.undo();
    c.link(r.link);
    c.handleWelcome(empty);
    expect(r.sent).toEqual([
      ['stroke.start', { strokeId: 's1', tool: 'b', color: '#111111', width: 8 }],
      ['stroke.points', { strokeId: 's1', n: 0, pts: [1, 1] }],
      ['stroke.end', { strokeId: 's1' }],
      ['stroke.start', { strokeId: 's2', tool: 'e', color: '#111111', width: 4 }],
      ['stroke.points', { strokeId: 's2', n: 0, pts: [2, 2] }],
      ['stroke.end', { strokeId: 's2' }],
      ['stroke.undo', { strokeId: 's2' }],
    ]);
    expect(c.getSnapshot()).toMatchObject({ canUndo: true, canRedo: false });
  });

  test('a later welcome keeps the undo and redo stacks', () => {
    const r = recorder();
    const c = new BoardController(undefined, undefined, ids());
    c.link(r.link);
    c.handleWelcome(empty);
    for (const p of [1, 2]) {
      c.beginStroke('b', '#111111', 8);
      c.addPoint(p, p);
      c.endStroke();
    }
    c.undo();
    const asServer = (id: string, seq: number) => {
      const s = c.store.get(id)!;
      return { id, seq, tool: s.tool, color: s.color, width: s.width, pts: s.pts.slice(), batches: 1, done: true, deleted: s.deleted, mine: true };
    };
    const before = r.sent.length;
    c.handleWelcome({ ...empty, seq: 8, strokes: [asServer('s1', 1), asServer('s2', 4)] });
    expect(r.sent.length).toBe(before);
    expect(c.getSnapshot()).toMatchObject({ canUndo: true, canRedo: true });
  });

  test('remote ops reach the store', () => {
    const c = new BoardController(undefined, undefined, ids());
    c.link(recorder().link);
    c.handleOp({ seq: 1, by: 'x', kind: 'stroke.start', strokeId: 'r', tool: 'b', color: '#111111', width: 2 });
    c.handleOp({ seq: 2, by: 'x', kind: 'stroke.points', strokeId: 'r', n: 0, pts: [3, 4] });
    expect(c.store.get('r')).toMatchObject({ mine: false, pts: [3, 4] });
  });
});
