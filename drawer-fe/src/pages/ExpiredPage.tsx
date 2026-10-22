/**
 * Shown over the top of the board when the room is gone (not-found). It is a notice, not a
 * modal: the board stays usable for local drawing (spec 10), and the button keeps that drawing.
 */
export function ExpiredPage({ onNewBoard }: { onNewBoard(): void }) {
  return (
    <section className="expired-card expired-notice" aria-labelledby="expired-title">
      <h2 id="expired-title">This board has expired</h2>
      <p>This link no longer works. You can keep drawing here, then start a new board.</p>
      <button type="button" className="primary" onClick={onNewBoard}>
        Start a new board from this drawing
      </button>
    </section>
  );
}
