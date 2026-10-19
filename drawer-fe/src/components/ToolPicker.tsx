import type { Tool } from '../engine/types';
import type { ToolAction } from '../state/tool-settings';

export function ToolPicker({ tool, dispatch }: { tool: Tool; dispatch: (a: ToolAction) => void }) {
  return (
    <div className="tool-picker" role="group" aria-label="Tool">
      <button type="button" aria-pressed={tool === 'b'} onClick={() => dispatch({ type: 'tool', tool: 'b' })}>
        Brush
      </button>
      <button type="button" aria-pressed={tool === 'e'} onClick={() => dispatch({ type: 'tool', tool: 'e' })}>
        Eraser
      </button>
    </div>
  );
}
