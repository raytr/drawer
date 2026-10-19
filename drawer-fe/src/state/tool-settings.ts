import { MAX_WIDTH, MIN_WIDTH, type Tool } from '../engine/types';

export const PALETTE = ['#111111', '#e03131', '#f08c00', '#2f9e44', '#1971c2', '#7048e8', '#c2255c', '#868e96'] as const;

export interface ToolSettings {
  tool: Tool;
  color: string;
  width: number;
}

export const initialToolSettings: ToolSettings = { tool: 'b', color: '#111111', width: 8 };

export const WIDTH_STEP = 2;

export type ToolAction =
  | { type: 'tool'; tool: Tool }
  | { type: 'color'; color: string }
  | { type: 'width'; width: number }
  | { type: 'widthStep'; delta: number };

export function toolReducer(state: ToolSettings, action: ToolAction): ToolSettings {
  switch (action.type) {
    case 'tool':
      return { ...state, tool: action.tool };
    case 'color':
      if (!(PALETTE as readonly string[]).includes(action.color)) return state;
      return { ...state, tool: 'b', color: action.color };
    case 'width':
      return { ...state, width: clampWidth(action.width) };
    case 'widthStep':
      return { ...state, width: clampWidth(state.width + action.delta) };
  }
}

function clampWidth(width: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));
}
