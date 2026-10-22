import { attachCursorInput } from './cursor-input';
import type { Presence } from './presence';

function pe(type: string, init: Partial<PointerEvent>) {
  return Object.assign(new Event(type), { pointerId: 1, pointerType: 'mouse', clientX: 0, clientY: 0, ...init });
}

function setup() {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;
  const pointer = vi.fn();
  const clock = { now: 0 };
  const detach = attachCursorInput(el, { pointer } as unknown as Presence, () => ({ scale: 1, offsetX: 0, offsetY: 0 }), () => clock.now);
  return { el, pointer, clock, detach };
}

test('moves inside the board send points; outside the board area is null', () => {
  const { el, pointer, clock } = setup();
  clock.now = 5;
  el.dispatchEvent(pe('pointermove', { clientX: 5, clientY: 6 }));
  el.dispatchEvent(pe('pointermove', { clientX: -1, clientY: 6 }));
  el.dispatchEvent(pe('pointermove', { clientX: 2000, clientY: 6 }));
  expect(pointer.mock.calls).toEqual([
    [[5, 6], 5],
    [null, 5],
    [null, 5],
  ]);
});

test('pointerleave and window blur send null; detach sends null and stops listening', () => {
  const { el, pointer, detach } = setup();
  el.dispatchEvent(pe('pointerleave', {}));
  window.dispatchEvent(new Event('blur'));
  detach();
  el.dispatchEvent(pe('pointermove', { clientX: 5, clientY: 6 }));
  expect(pointer.mock.calls.map((c) => c[0])).toEqual([null, null, null]);
});
