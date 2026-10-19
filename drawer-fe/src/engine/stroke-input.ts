import type { ToolSettings } from '../state/tool-settings';
import type { BoardController } from './board-controller';
import { toBoardPoint, type Fit } from './geometry';

/**
 * Turns pointer events (mouse, pen, touch) on the target into strokes.
 * Only the first pointer draws; others are ignored until it lifts.
 * A stroke also ends when the window loses focus, the page is hidden, a context menu
 * opens, or the mouse moves with no button held, because browsers do not promise an
 * end event in those cases.
 * Returns a function that removes the listeners (and ends an active stroke).
 */
export function attachStrokeInput(
  target: HTMLElement,
  controller: BoardController,
  getSettings: () => ToolSettings,
  getFit: () => Fit,
): () => void {
  let activePointer: number | null = null;

  function add(event: { clientX: number; clientY: number }) {
    const [x, y] = toBoardPoint(event.clientX, event.clientY, target.getBoundingClientRect(), getFit());
    controller.addPoint(x, y);
  }

  function end() {
    if (activePointer === null) return;
    activePointer = null;
    controller.endStroke();
  }

  function onDown(event: PointerEvent) {
    if (activePointer !== null) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    activePointer = event.pointerId;
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // Capture can fail for a pointer that is already gone; drawing still works.
    }
    const { tool, color, width } = getSettings();
    controller.beginStroke(tool, color, width);
    add(event);
  }

  function onMove(event: PointerEvent) {
    if (event.pointerId !== activePointer) return;
    if (event.pointerType === 'mouse' && event.buttons === 0) {
      end();
      return;
    }
    const coalesced = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
    if (coalesced.length > 0) for (const e of coalesced) add(e);
    else add(event);
  }

  function onEnd(event: PointerEvent) {
    if (event.pointerId === activePointer) end();
  }

  function onVisibility() {
    if (document.visibilityState === 'hidden') end();
  }

  target.addEventListener('pointerdown', onDown);
  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerup', onEnd);
  target.addEventListener('pointercancel', onEnd);
  target.addEventListener('lostpointercapture', onEnd);
  target.addEventListener('contextmenu', end);
  window.addEventListener('blur', end);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    end();
    target.removeEventListener('pointerdown', onDown);
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerup', onEnd);
    target.removeEventListener('pointercancel', onEnd);
    target.removeEventListener('lostpointercapture', onEnd);
    target.removeEventListener('contextmenu', end);
    window.removeEventListener('blur', end);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
