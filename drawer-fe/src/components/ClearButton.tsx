import { useState } from 'react';

/** Clearing asks for confirmation inside the page; browser dialogs are not used. */
export function ClearButton({ disabled, onClear }: { disabled: boolean; onClear(): void }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" className="clear-button" disabled={disabled} onClick={() => setConfirming(true)}>
        Clear board
      </button>
    );
  }
  return (
    <div className="clear-confirm" role="group" aria-label="Confirm clear">
      <p>Clear the whole board?</p>
      <button
        type="button"
        className="danger"
        onClick={() => {
          setConfirming(false);
          onClear();
        }}
      >
        Clear
      </button>
      <button type="button" onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </div>
  );
}
