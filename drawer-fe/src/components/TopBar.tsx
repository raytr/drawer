export function TopBar() {
  return (
    <header className="top-bar">
      <span className="logo">drawer</span>
      <span className="status-badge status-local">Local only</span>
      <button type="button" className="share-button" disabled title="Share comes in the next milestone">
        Share
      </button>
    </header>
  );
}
