import { BACKGROUND, MAX_WIDTH, MIN_WIDTH, type Stroke } from './types';

const COLOR = /^#[0-9a-f]{6}$/;

/**
 * Base layer: finished strokes before the first unfinished one.
 * Live layer: every stroke from the first unfinished one on, so z-order stays right.
 * Deleted strokes are skipped.
 */
export function splitLayers(strokes: readonly Stroke[]): { base: Stroke[]; live: Stroke[] } {
  const visible = strokes.filter((s) => !s.deleted);
  const firstOpen = visible.findIndex((s) => !s.done);
  if (firstOpen === -1) return { base: visible, live: [] };
  return { base: visible.slice(0, firstOpen), live: visible.slice(firstOpen) };
}

/** Stroke data can come from other users, so it is checked before drawing. */
export function safeStyle(stroke: Stroke): { color: string; width: number } {
  const color = stroke.tool === 'e' ? BACKGROUND : COLOR.test(stroke.color) ? stroke.color : '#000000';
  const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(stroke.width) || MIN_WIDTH));
  return { color, width };
}

/** Member colors come from other users, so they are checked before use in CSS. */
export function safeColor(color: string): string {
  return COLOR.test(color) ? color : '#868e96';
}
