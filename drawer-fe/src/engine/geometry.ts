import { BOARD_HEIGHT, BOARD_WIDTH } from './types';

export interface Fit {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** Largest scale that shows the whole board inside the view, centered (letterbox). */
export function fitBoard(viewWidth: number, viewHeight: number): Fit {
  const scale = Math.min(viewWidth / BOARD_WIDTH, viewHeight / BOARD_HEIGHT);
  return {
    scale,
    offsetX: (viewWidth - BOARD_WIDTH * scale) / 2,
    offsetY: (viewHeight - BOARD_HEIGHT * scale) / 2,
  };
}

/** Converts a pointer position on screen to an integer board point inside the board. */
export function toBoardPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number },
  fit: Fit,
): [number, number] {
  const x = Math.round((clientX - rect.left - fit.offsetX) / fit.scale);
  const y = Math.round((clientY - rect.top - fit.offsetY) / fit.scale);
  return [clamp(x, 0, BOARD_WIDTH - 1), clamp(y, 0, BOARD_HEIGHT - 1)];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
