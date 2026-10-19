import { initialToolSettings } from '../state/tool-settings';
import { BoardController } from './board-controller';
import { attachStrokeInput } from './stroke-input';

function pe(type: string, init: Partial<PointerEvent>) {
  return Object.assign(new Event(type), { pointerId: 1, button: 0, pointerType: 'mouse', clientX: 0, clientY: 0, ...init });
}

function setup() {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0 } as DOMRect);
  el.setPointerCapture = vi.fn();
  const c = new BoardController(undefined, undefined, () => 's1');
  attachStrokeInput(el, c, () => initialToolSettings, () => ({ scale: 1, offsetX: 0, offsetY: 0 }));
  return { el, c };
}

test('down, move, up makes one finished stroke', () => {
  const { el, c } = setup();
  el.dispatchEvent(pe('pointerdown', { clientX: 1, clientY: 1 }));
  el.dispatchEvent(pe('pointermove', { clientX: 5, clientY: 5 }));
  el.dispatchEvent(pe('pointerup', {}));
  expect(c.store.get('s1')).toMatchObject({ done: true, pts: [1, 1, 5, 5] });
});

test('pointercancel ends the stroke', () => {
  const { el, c } = setup();
  el.dispatchEvent(pe('pointerdown', {}));
  el.dispatchEvent(pe('pointercancel', {}));
  expect(c.getSnapshot().drawing).toBe(false);
  expect(c.store.get('s1')!.done).toBe(true);
});

test('a second pointer is ignored while one is active', () => {
  const { el, c } = setup();
  el.dispatchEvent(pe('pointerdown', { clientX: 1, clientY: 1 }));
  el.dispatchEvent(pe('pointermove', { pointerId: 2, clientX: 9, clientY: 9 }));
  el.dispatchEvent(pe('pointerup', { pointerId: 2 }));
  expect(c.getSnapshot().drawing).toBe(true);
  c.flush();
  expect(c.store.get('s1')!.pts).toEqual([1, 1]);
});

test('window blur ends the stroke', () => {
  const { el, c } = setup();
  el.dispatchEvent(pe('pointerdown', {}));
  window.dispatchEvent(new Event('blur'));
  expect(c.getSnapshot().drawing).toBe(false);
  expect(c.store.get('s1')!.done).toBe(true);
});

test('a mouse move with no button held ends the stroke', () => {
  const { el, c } = setup();
  el.dispatchEvent(pe('pointerdown', { clientX: 1, clientY: 1 }));
  el.dispatchEvent(pe('pointermove', { clientX: 9, clientY: 9, buttons: 0 }));
  expect(c.getSnapshot().drawing).toBe(false);
  expect(c.store.get('s1')!.pts).toEqual([1, 1]);
});

test('lostpointercapture ends the stroke', () => {
  const { el, c } = setup();
  el.dispatchEvent(pe('pointerdown', {}));
  el.dispatchEvent(pe('lostpointercapture', {}));
  expect(c.getSnapshot().drawing).toBe(false);
});

test('detach ends an active stroke', () => {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0 } as DOMRect);
  el.setPointerCapture = vi.fn();
  const c = new BoardController(undefined, undefined, () => 's1');
  const detach = attachStrokeInput(el, c, () => initialToolSettings, () => ({ scale: 1, offsetX: 0, offsetY: 0 }));
  el.dispatchEvent(pe('pointerdown', {}));
  detach();
  expect(c.getSnapshot().drawing).toBe(false);
});
