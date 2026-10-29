import { useCallback, useMemo, useState } from 'react';
import { loadNotes, localDay, saveNotes, setNote } from '../board/notes.ts';
import type { NoteEntry } from '../board/notes.ts';

// Standup notes and today's date. `now` moves every minute, so at midnight today becomes a new day and its
// checkboxes start empty (NOTE-5).
export function useNotes(now: number) {
  const [notes, setNotes] = useState(loadNotes);
  const today = localDay(now);
  // Today by default; an earlier day when its note is edited (NOTE-8).
  const update = useCallback((key: string, change: Partial<Pick<NoteEntry, 'asked' | 'text'>>, day = today) => {
    setNotes((prev) => {
      const next = setNote(prev, key, day, change);
      saveNotes(next);
      return next;
    });
  }, [today]);
  return useMemo(() => ({ notes, today, update }), [notes, today, update]);
}
