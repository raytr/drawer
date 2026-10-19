import { MAX_WIDTH, MIN_WIDTH } from '../engine/types';
import type { ToolAction } from '../state/tool-settings';

export function SizeSlider({ width, dispatch }: { width: number; dispatch: (a: ToolAction) => void }) {
  return (
    <div className="size-slider">
      <label htmlFor="stroke-width">Width</label>
      <input
        id="stroke-width"
        type="range"
        min={MIN_WIDTH}
        max={MAX_WIDTH}
        value={width}
        onChange={(e) => dispatch({ type: 'width', width: Number(e.target.value) })}
      />
      <output htmlFor="stroke-width">{width}</output>
    </div>
  );
}
