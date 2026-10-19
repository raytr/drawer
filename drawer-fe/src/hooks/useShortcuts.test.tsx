import { fireEvent, renderHook } from '@testing-library/react';
import { useShortcuts } from './useShortcuts';

function setup() {
  const h = { brush: vi.fn(), eraser: vi.fn(), widthDown: vi.fn(), widthUp: vi.fn(), undo: vi.fn(), redo: vi.fn() };
  renderHook(() => useShortcuts(h));
  return h;
}

test('keys map to handlers', () => {
  const h = setup();
  fireEvent.keyDown(window, { key: 'e' });
  fireEvent.keyDown(window, { key: ']' });
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
  fireEvent.keyDown(window, { key: 'z', metaKey: true, shiftKey: true });
  expect(h.eraser).toHaveBeenCalledTimes(1);
  expect(h.widthUp).toHaveBeenCalledTimes(1);
  expect(h.undo).toHaveBeenCalledTimes(1);
  expect(h.redo).toHaveBeenCalledTimes(1);
});

test('typing, composing, and Alt are ignored', () => {
  const h = setup();
  const input = document.createElement('input'); document.body.appendChild(input);
  fireEvent.keyDown(input, { key: 'b' });
  fireEvent.keyDown(window, { key: 'b', isComposing: true });
  fireEvent.keyDown(window, { key: 'b', altKey: true });
  expect(h.brush).not.toHaveBeenCalled();
});

test('a focused range slider does not block shortcuts', () => {
  const h = setup();
  const range = document.createElement('input'); range.type = 'range'; document.body.appendChild(range);
  fireEvent.keyDown(range, { key: 'e' });
  fireEvent.keyDown(range, { key: 'z', ctrlKey: true });
  expect(h.eraser).toHaveBeenCalledTimes(1);
  expect(h.undo).toHaveBeenCalledTimes(1);
});

test('Ctrl+Z while composing text does not undo', () => {
  const h = setup();
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true, isComposing: true });
  expect(h.undo).not.toHaveBeenCalled();
});
