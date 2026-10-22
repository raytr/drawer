import type { Fit } from './geometry';
import type { Presence } from './presence';

/** Moves each label to its member's cursor in screen pixels, or hides it. */
export function placeCursors(layer: HTMLElement, presence: Presence, fit: Fit): void {
  for (const el of layer.querySelectorAll<HTMLElement>('[data-member]')) {
    const cursor = presence.cursorOf(el.dataset.member ?? '');
    if (!cursor) {
      el.hidden = true;
      continue;
    }
    el.hidden = false;
    el.style.transform = `translate(${fit.offsetX + cursor.x * fit.scale}px, ${fit.offsetY + cursor.y * fit.scale}px)`;
  }
}
