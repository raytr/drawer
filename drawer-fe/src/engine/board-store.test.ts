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
