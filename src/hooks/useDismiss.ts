import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { onEscape } from './escapeStack.ts';

// Closes a menu or popover on a click outside it, or on Escape when it is the innermost open layer.

export function useDismiss(open: boolean, setOpen: Dispatch<SetStateAction<boolean>>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (event: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    const removeLayer = onEscape(() => setOpen(false));
    return () => {
      document.removeEventListener('mousedown', onDoc);
      removeLayer();
    };
  }, [open, setOpen]);
  return ref;
}
