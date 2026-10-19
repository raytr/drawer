export function HistoryButtons(props: { canUndo: boolean; canRedo: boolean; onUndo(): void; onRedo(): void }) {
  return (
    <div className="history-buttons">
      <button type="button" disabled={!props.canUndo} onClick={props.onUndo}>
        Undo
      </button>
      <button type="button" disabled={!props.canRedo} onClick={props.onRedo}>
        Redo
      </button>
    </div>
  );
}
