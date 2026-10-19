/** Shown over the board when the room is gone (not-found). The drawing stays on the page. */
export function ExpiredPage({ onNewBoard }: { onNewBoard(): void }) {
  return (
    <div className="dialog-backdrop">
      <div className="expired-card" role="dialog" aria-modal="true" aria-labelledby="expired-title">
        <h2 id="expired-title">This board has expired</h2>
        <p>This link no longer works. The drawing on this page is still here.</p>
        <button type="button" className="primary" onClick={onNewBoard}>
          Start a new board from this drawing
        </button>
      </div>
    </div>
  );
}
