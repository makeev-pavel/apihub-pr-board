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

// Today's note and the earlier ones (NOTE-4). Today's text is saved on blur, on Ctrl+Enter, and when the popover closes.
function NotePopover({ pr, prKey, entries, today, update, style }: {
  pr: DerivedPullRequest;
  prKey: string;
  entries: NoteEntry[];
  today: string;
  update: (key: string, change: Partial<Pick<NoteEntry, 'asked' | 'text'>>) => void;
  style: CSSProperties | undefined;
}) {
  const current = noteFor(entries, today);
  const [draft, setDraft] = useState(current ? current.text : '');
  const draftRef = useRef(draft);
  const saved = useRef(current ? current.text : '');
  useEffect(() => { draftRef.current = draft; });
  const commit = useCallback(() => {
    const text = draftRef.current.trim();
    if (text === saved.current) return;
    saved.current = text;
    update(prKey, { text });
  }, [prKey, update]);
  // Closing with Escape or a click outside unmounts the field without a blur, so the draft is saved here too.
  useEffect(() => commit, [commit]);
  const earlier = entries.filter((entry) => entry.date < today);

  return (
    <div className="popover note-popover" role="dialog" aria-label={'Standup notes for PR #' + pr.number} style={style}>
      <strong className="popover-title">Today</strong>
      <label className="note-asked">
        <input type="checkbox" checked={!!current && current.asked} onChange={(event) => update(prKey, { asked: event.target.checked })} />
        Status asked
      </label>
      <textarea className="text-field" rows={3} value={draft} placeholder="What was done or promised" aria-label="Today's note"
        onChange={(event) => setDraft(event.target.value)} onBlur={commit}
        onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) commit(); }} />
      {earlier.length ? (
        <>
          <strong className="popover-title">Earlier</strong>
          <ul className="note-history">
            {earlier.map((entry) => (
              <li key={entry.date}>
                <span className="when">{dayLabel(entry.date, today)}</span>
                {entry.asked ? <span className="chip">asked</span> : null}
                {entry.text ? <span className="note-text">{entry.text}</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
