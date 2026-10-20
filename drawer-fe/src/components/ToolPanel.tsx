import type { BoardSnapshot } from '../engine/board-controller';
import type { ToolAction, ToolSettings } from '../state/tool-settings';
import { ClearButton } from './ClearButton';
import { ColorSwatches } from './ColorSwatches';
import { HistoryButtons } from './HistoryButtons';
import { SizeSlider } from './SizeSlider';
import { ToolPicker } from './ToolPicker';

export interface ToolPanelProps {
  settings: ToolSettings;
  dispatch: (a: ToolAction) => void;
  snapshot: BoardSnapshot;
  onUndo(): void;
  onRedo(): void;
  onClear(): void;
  /** False in a room: only the owner will clear there (M4). */
  canClear: boolean;
}

export function ToolPanel({ settings, dispatch, snapshot, onUndo, onRedo, onClear, canClear }: ToolPanelProps) {
  return (
    <aside className="tool-panel" aria-label="Tools">
      <ToolPicker tool={settings.tool} dispatch={dispatch} />
      <ColorSwatches color={settings.color} dispatch={dispatch} />
      <SizeSlider width={settings.width} dispatch={dispatch} />
      <HistoryButtons canUndo={snapshot.canUndo} canRedo={snapshot.canRedo} onUndo={onUndo} onRedo={onRedo} />
      {canClear && <ClearButton disabled={!snapshot.hasVisible} onClear={onClear} />}
    </aside>
  );
}
