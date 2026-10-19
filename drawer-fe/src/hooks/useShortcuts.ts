import { useEffect, useRef } from 'react';

export interface ShortcutHandlers {
  brush(): void;
  eraser(): void;
  widthDown(): void;
  widthUp(): void;
  undo(): void;
  redo(): void;
}

/**
 * B brush, E eraser, [ and ] width, Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z redo.
 * Ignored while the user types or composes text (for example Vietnamese Telex input) and with Alt.
 */
export function useShortcuts(handlers: ShortcutHandlers): void {
  const ref = useRef(handlers);

  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.isComposing || event.altKey || isEditable(event.target)) return;
      const key = event.key.toLowerCase();
      const h = ref.current;
      if (event.ctrlKey || event.metaKey) {
        if (key !== 'z') return;
        event.preventDefault();
        if (event.shiftKey) h.redo();
        else h.undo();
        return;
      }
      if (key === 'b') h.brush();
      else if (key === 'e') h.eraser();
      else if (key === '[') h.widthDown();
      else if (key === ']') h.widthUp();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

/** Inputs where a key press is not text entry, so shortcuts still apply (for example the Width slider). */
const NON_TEXT_INPUTS = new Set(['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color']);

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type);
  return target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}
