import { useSyncExternalStore } from 'react';
import type { BoardController, BoardSnapshot } from '../engine/board-controller';

/** Reads the slow-changing board state. Strokes themselves never enter React state. */
export function useBoard(controller: BoardController): BoardSnapshot {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot);
}
