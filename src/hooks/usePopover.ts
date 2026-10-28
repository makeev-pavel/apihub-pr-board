import { useEffect, useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { useDismiss } from './useDismiss.ts';

const POPOVER_GAP_PX = 6;
export const POPOVER_EDGE_PX = 16;

// Open a popover upward when less than this much room is left below its trigger.
const POPOVER_FLIP_PX = 260;

// Popovers are position: fixed so the scrolling table container cannot clip them.
// Page scroll closes them; scrolling inside the popover itself does not.
export function usePopover(width: number) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties | undefined>(undefined);
  const ref = useDismiss(open, setOpen);
  useEffect(() => {
    if (!open) return undefined;
    const onScroll = (event: Event) => {
      if (!(ref.current && ref.current.contains(event.target as Node))) setOpen(false);
    };
    const close = () => setOpen(false);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open, ref]);

  const toggle = (event: MouseEvent<HTMLElement>) => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const horizontal = rect.left + width > window.innerWidth - POPOVER_EDGE_PX
      ? { right: Math.max(POPOVER_EDGE_PX, window.innerWidth - rect.right) }
      : { left: Math.max(POPOVER_EDGE_PX, rect.left) };
    const vertical = window.innerHeight - rect.bottom < POPOVER_FLIP_PX
      ? { bottom: window.innerHeight - rect.top + POPOVER_GAP_PX }
      : { top: rect.bottom + POPOVER_GAP_PX };
    setPosition({ ...horizontal, ...vertical, width });
    setOpen(true);
  };
  return { open, position, ref, toggle };
}
