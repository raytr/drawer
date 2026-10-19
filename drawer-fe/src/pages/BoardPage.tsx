import { useReducer, useState } from 'react';
import { CanvasStage } from '../components/CanvasStage';
import { ToolPanel } from '../components/ToolPanel';
import { TopBar } from '../components/TopBar';
import { BoardController } from '../engine/board-controller';
import { useBoard } from '../hooks/useBoard';
import { useShortcuts } from '../hooks/useShortcuts';
import { WIDTH_STEP, initialToolSettings, toolReducer } from '../state/tool-settings';

export function BoardPage() {
  const [controller] = useState(() => new BoardController());
  const [settings, dispatch] = useReducer(toolReducer, initialToolSettings);
  const snapshot = useBoard(controller);

  useShortcuts({
    brush: () => dispatch({ type: 'tool', tool: 'b' }),
    eraser: () => dispatch({ type: 'tool', tool: 'e' }),
    widthDown: () => dispatch({ type: 'widthStep', delta: -WIDTH_STEP }),
    widthUp: () => dispatch({ type: 'widthStep', delta: WIDTH_STEP }),
    undo: () => controller.undo(),
    redo: () => controller.redo(),
  });

  return (
    <div className="board-page">
      <TopBar />
      <main className="board-main">
        <CanvasStage controller={controller} settings={settings} />
        <ToolPanel
          settings={settings}
          dispatch={dispatch}
          snapshot={snapshot}
          onUndo={() => controller.undo()}
          onRedo={() => controller.redo()}
          onClear={() => controller.clear()}
        />
      </main>
    </div>
  );
}
