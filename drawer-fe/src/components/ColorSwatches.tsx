import { PALETTE, type ToolAction } from '../state/tool-settings';

export function ColorSwatches({ color, dispatch }: { color: string; dispatch: (a: ToolAction) => void }) {
  return (
    <div className="color-swatches" role="group" aria-label="Colors">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          className="swatch"
          style={{ background: c }}
          aria-label={`Color ${c}`}
          aria-pressed={c === color}
          onClick={() => dispatch({ type: 'color', color: c })}
        />
      ))}
    </div>
  );
}
