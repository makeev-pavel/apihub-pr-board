import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { dayLabel, earlierNote, noteFor } from '../../board/notes.ts';
import type { NoteEntry } from '../../board/notes.ts';
import { NotesContext } from '../../context.ts';
import { usePopover } from '../../hooks/usePopover.ts';
import { pullRequestKey } from '../../model/report.ts';
import type { DerivedPullRequest } from '../../types.ts';

const NOTE_POPOVER_PX = 360;

// The Standup cell (NOTE-3): asked today, and today's note, or the latest earlier one faded as a reminder.
export function NoteCell({ pr }: { pr: DerivedPullRequest }) {
  const { notes, today, update } = useContext(NotesContext);
  const { open, position, ref, toggle } = usePopover(NOTE_POPOVER_PX);
  const key = pullRequestKey(pr);
  const entries = notes[key];
  const note = noteFor(entries, today);
  const earlier = note && note.text ? null : earlierNote(entries, today);
  const preview = note && note.text ? note.text
    : earlier ? dayLabel(earlier.date, today) + ': ' + (earlier.text || 'asked') : 'Add note';
  return (
    <div className="note-wrap" ref={ref}>
      <input type="checkbox" checked={!!note && note.asked} aria-label={'Status asked today, PR #' + pr.number}
        title="Status asked today" onChange={(event) => update(key, { asked: event.target.checked })} />
      <button type="button" className={'note-preview' + (note && note.text ? '' : ' faded')} aria-expanded={open}
        aria-label={'Standup notes for PR #' + pr.number + ': ' + preview} onClick={toggle}>{preview}</button>
      {open ? <NotePopover pr={pr} prKey={key} entries={entries || []} today={today} update={update} style={position} /> : null}
    </div>
  );
}

type NoteChange = Partial<Pick<NoteEntry, 'asked' | 'text'>>;

// Today's note and the earlier ones, each editable (NOTE-4, NOTE-8).
function NotePopover({ pr, prKey, entries, today, update, style }: {
  pr: DerivedPullRequest;
  prKey: string;
  entries: NoteEntry[];
  today: string;
  update: (key: string, change: NoteChange, day?: string) => void;
  style: CSSProperties | undefined;
}) {
  const earlier = entries.filter((entry) => entry.date < today);
  return (
    <div className="popover note-popover" role="dialog" aria-label={'Standup notes for PR #' + pr.number} style={style}>
      <strong className="popover-title">Today</strong>
      <NoteEditor entry={noteFor(entries, today)} rows={3} askedLabel="Status asked" textLabel="Today's note"
        onChange={(change) => update(prKey, change, today)} />
      {earlier.length ? (
        <>
          <strong className="popover-title">Earlier</strong>
          <ul className="note-history">
            {earlier.map((entry) => {
              const day = dayLabel(entry.date, today);
              return (
                <li key={entry.date}>
                  <span className="when">{day}</span>
                  <NoteEditor entry={entry} rows={2} askedLabel={'Status asked ' + day} textLabel={'Note for ' + day}
                    onChange={(change) => update(prKey, change, entry.date)} />
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}

// One day's checkbox and text. The text is saved on blur, on Ctrl+Enter, and when the popover closes; a day whose box is
// unchecked and whose text is empty is removed.
function NoteEditor({ entry, rows, askedLabel, textLabel, onChange }: {
  entry: NoteEntry | null;
  rows: number;
  askedLabel: string;
  textLabel: string;
  onChange: (change: NoteChange) => void;
}) {
  const [draft, setDraft] = useState(entry ? entry.text : '');
  const draftRef = useRef(draft);
  const saved = useRef(entry ? entry.text : '');
  const onChangeRef = useRef(onChange);
  useEffect(() => { draftRef.current = draft; onChangeRef.current = onChange; });
  const commit = useCallback(() => {
    const text = draftRef.current.trim();
    if (text === saved.current) return;
    saved.current = text;
    onChangeRef.current({ text });
  }, []);
  // Closing with Escape or a click outside unmounts the field without a blur, so the draft is saved here too.
  useEffect(() => commit, [commit]);
  return (
    <div className="note-editor">
      <label className="note-asked">
        <input type="checkbox" checked={!!entry && entry.asked} onChange={(event) => onChange({ asked: event.target.checked })} />
        {askedLabel}
      </label>
      <textarea className="text-field" rows={rows} value={draft} placeholder="What was done or promised" aria-label={textLabel}
        onChange={(event) => setDraft(event.target.value)} onBlur={commit}
        onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) commit(); }} />
    </div>
  );
}
