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
