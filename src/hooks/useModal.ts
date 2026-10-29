import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href]';

// A modal dialog: Escape closes it, Tab stays inside it, as aria-modal promises, and on close focus returns where it
// was, or to the element with fallbackId when that is gone (a panel that closed when the dialog opened).
export function useModal(onClose: () => void, fallbackId: string) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  // Read while rendering, before an autoFocus inside the dialog takes focus.
  const opener = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    const before = opener.current;
    const dialog = ref.current;
    return () => {
      // Only once the dialog has left the page: React's development double run also calls this, with it still there.
      window.setTimeout(() => {
        if (dialog && dialog.isConnected) return;
        const target = before && before.isConnected && before !== document.body ? before : document.getElementById(fallbackId);
        if (target) target.focus();
      });
    };
  }, [fallbackId]);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { last.focus(); event.preventDefault(); }
    else if (!event.shiftKey && document.activeElement === last) { first.focus(); event.preventDefault(); }
  };
  return { ref, onKeyDown };
}
