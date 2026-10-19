import { BoardStore } from './board-store';
import { History } from './history';

function draw(store: BoardStore, h: History, id: string) {
  store.startStroke({ id, tool: 'b', color: '#111111', width: 8 });
  store.appendPoints(id, [1, 1, 2, 2]);
  store.endStroke(id);
  h.recordStroke(id);
}

test('draw, clear, undo brings every stroke back', () => {
  const store = new BoardStore(); const h = new History(store);
  draw(store, h, 'a'); draw(store, h, 'b');
  h.clear();
  expect(store.visibleIds()).toEqual([]);
  expect(h.undo()).toBe(true);
  expect(store.visibleIds()).toEqual(['a', 'b']);
});

test('redo of a clear hides the same strokes again', () => {
  const store = new BoardStore(); const h = new History(store);
  draw(store, h, 'a');
  h.clear(); h.undo(); h.redo();
  expect(store.visibleIds()).toEqual([]);
});

test('undo and redo of a single stroke', () => {
  const store = new BoardStore(); const h = new History(store);
  draw(store, h, 'a');
  h.undo();
  expect(store.get('a')!.deleted).toBe(true);
  h.redo();
  expect(store.get('a')!.deleted).toBe(false);
});

test('a new stroke empties the redo stack', () => {
  const store = new BoardStore(); const h = new History(store);
  draw(store, h, 'a'); h.undo();
  draw(store, h, 'b');
  expect(h.canRedo).toBe(false);
  expect(h.redo()).toBe(false);
});

test('clear on an empty board records nothing', () => {
  const store = new BoardStore(); const h = new History(store);
  h.clear();
  expect(h.canUndo).toBe(false);
});
