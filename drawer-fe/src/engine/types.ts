export type Tool = 'b' | 'e';

export interface Stroke {
  id: string;
  /** Server order. Always null in M1; the server assigns it from M2 on. */
  seq: number | null;
  /** Creation order inside this tab. */
  localOrder: number;
  tool: Tool;
  color: string;
  width: number;
  /** Flat integer list: [x, y, x, y, ...] in board pixels. */
  pts: number[];
  done: boolean;
  deleted: boolean;
  mine: boolean;
}

export const BOARD_WIDTH = 1920;
export const BOARD_HEIGHT = 1080;
export const BACKGROUND = '#ffffff';
export const MAX_POINTS_PER_BATCH = 64;
export const MAX_POINTS_PER_STROKE = 5000;
export const MIN_WIDTH = 1;
export const MAX_WIDTH = 64;
