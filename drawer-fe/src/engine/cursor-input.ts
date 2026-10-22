import { toBoardPointInside, type Fit } from './geometry';
import type { Presence } from './presence';

/**
 * Reports this tab's pointer to the room: every move (drawing or not) as a board point,
 * or null when it is outside the board, leaves the stage, or the window loses focus.
 * Presence decides how often it is sent. Returns a function that removes the listeners.
 */
export function attachCursorInput(
  target: HTMLElement,
  presence: Presence,
  getFit: () => Fit,
  now: () => number = () => performance.now(),
): () => void {
  function onMove(event: PointerEvent) {
    const point = toBoardPointInside(event.clientX, event.clientY, target.getBoundingClientRect(), getFit());
    presence.pointer(point, now());
  }

  function onLeave() {
    presence.pointer(null, now());
  }

  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerleave', onLeave);
  target.addEventListener('pointercancel', onLeave);
  window.addEventListener('blur', onLeave);
  return () => {
    target.removeEventListener('pointermove', onMove);
    target.removeEventListener('pointerleave', onLeave);
    target.removeEventListener('pointercancel', onLeave);
    window.removeEventListener('blur', onLeave);
    onLeave();
  };
}
