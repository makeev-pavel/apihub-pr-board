import { useCallback, useMemo, useState } from 'react';
import { loadNotes, saveNotes, setNote } from '../board/notes.ts';

// Notes per PR, one Markdown document each (NOTE-1), saved in this browser on every change.
export function useNotes() {
  const [notes, setNotes] = useState(loadNotes);
  const update = useCallback((key: string, text: string) => {
    setNotes((prev) => {
      const next = setNote(prev, key, text, Date.now());
      saveNotes(next);
      return next;
    });
  }, []);
  return useMemo(() => ({ notes, update }), [notes, update]);
}
