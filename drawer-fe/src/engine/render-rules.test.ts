import { safeStyle, splitLayers } from './render-rules';
import type { Stroke } from './types';

const st = (id: string, done: boolean, deleted = false): Stroke =>
  ({ id, seq: null, localOrder: 0, tool: 'b', color: '#111111', width: 8, pts: [], done, deleted, mine: true });

test('base stops at the first unfinished stroke', () => {
  const r = splitLayers([st('a', true), st('b', false), st('c', true)]);
  expect(r.base.map((s) => s.id)).toEqual(['a']);
  expect(r.live.map((s) => s.id)).toEqual(['b', 'c']);
});

test('deleted strokes are skipped; all finished means empty live', () => {
  const r = splitLayers([st('a', true), st('x', false, true), st('c', true)]);
  expect(r.base.map((s) => s.id)).toEqual(['a', 'c']);
  expect(r.live).toEqual([]);
});

test('safeStyle', () => {
  expect(safeStyle({ ...st('e', true), tool: 'e', color: '#e03131' }).color).toBe('#ffffff');
  expect(safeStyle({ ...st('a', true), color: 'red' }).color).toBe('#000000');
  expect(safeStyle({ ...st('a', true), width: 0 }).width).toBe(1);
  expect(safeStyle({ ...st('a', true), width: 100 }).width).toBe(64);
});
