import { useRef, useState } from 'react';

/** The room link with a Copy button; selecting the text is the fallback when the clipboard is blocked. */
export function ShareDialog({ url, onClose }: { url: string; onClose(): void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  const selectLink = () => inputRef.current?.select();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      selectLink();
    }
  };

  return (
    <div className="dialog-backdrop" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <h2 id="share-title">Share this board</h2>
        <div className="share-link">
          <input ref={inputRef} readOnly value={url} aria-label="Board link" onFocus={selectLink} autoFocus />
          <button type="button" className="primary" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
        <p>Anyone with the link can draw</p>
        <p>Deleted 24 hours after the last visitor</p>
        <button type="button" className="dialog-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
