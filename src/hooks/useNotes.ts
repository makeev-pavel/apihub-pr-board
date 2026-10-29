import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadNotes, NOTES_KEY, readStoredNotes, saveNotes, setNote } from '../board/notes.ts';

// Notes per PR, one Markdown document each (NOTE-1). Another tab may have written since this one loaded, so a change
// is built on what is stored now, and a storage event from another tab reloads the notes (NOTE-2).
export function useNotes() {
  const [notes, setNotes] = useState(loadNotes);
  const [saveFailed, setSaveFailed] = useState(false);
  const current = useRef(notes);
  useEffect(() => { current.current = notes; });
  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === NOTES_KEY || event.key === null) setNotes(loadNotes()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const update = useCallback((key: string, text: string) => {
    const next = setNote(readStoredNotes() || current.current, key, text, Date.now());
    setSaveFailed(!saveNotes(next));
    current.current = next;
    setNotes(next);
  }, []);
  return useMemo(() => ({ notes, update, saveFailed }), [notes, update, saveFailed]);
}
