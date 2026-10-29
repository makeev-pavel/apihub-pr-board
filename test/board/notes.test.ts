import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayLabel, earlierNote, loadNotes, localDay, MAX_NOTE_DAYS, noteFor, parseNotes, saveNotes, setNote, standupOf,
} from '../../src/board/notes.ts';

const KEY = 'acme/widgets#7';

// A Map-backed localStorage, or one that throws like a browser with storage blocked.
function useStorage(blocked = false) {
  const data = new Map<string, string>();
  const fail = () => { throw new Error('storage is blocked'); };
  Object.assign(globalThis, {
    localStorage: {
      getItem: blocked ? fail : (key: string) => data.get(key) ?? null,
      setItem: blocked ? fail : (key: string, value: string) => { data.set(key, value); },
    },
  });
  return data;
}

afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

test('NOTE-1: a day is the local calendar day', () => {
  assert.equal(localDay(new Date(2026, 9, 28, 23, 59).getTime()), '2026-10-28');
  assert.equal(localDay(new Date(2026, 9, 29, 0, 1).getTime()), '2026-10-29');
  assert.equal(localDay(new Date(2026, 0, 5, 12).getTime()), '2026-01-05');
});

test('NOTE-1 NOTE-4: today has one note per PR; typing marks it asked, and earlier days stay', () => {
  let notes = setNote({}, KEY, '2026-10-27', { text: 'Fix the tests by noon' });
  assert.deepEqual(noteFor(notes[KEY], '2026-10-27'), { date: '2026-10-27', asked: true, text: 'Fix the tests by noon' });
  notes = setNote(notes, KEY, '2026-10-28', { asked: true });
  notes = setNote(notes, KEY, '2026-10-28', { text: 'Tests fixed, waiting for review' });
  assert.deepEqual(notes[KEY].map((n) => n.date), ['2026-10-28', '2026-10-27'], 'newest first');
  assert.deepEqual(noteFor(notes[KEY], '2026-10-28'), { date: '2026-10-28', asked: true, text: 'Tests fixed, waiting for review' });
  // Unchecking keeps the text; an entry with nothing left is removed.
  notes = setNote(notes, KEY, '2026-10-28', { asked: false });
  assert.equal(noteFor(notes[KEY], '2026-10-28')?.text, 'Tests fixed, waiting for review');
  notes = setNote(notes, KEY, '2026-10-28', { text: '  ' });
  assert.equal(noteFor(notes[KEY], '2026-10-28'), null);
  assert.equal(notes[KEY].length, 1);
  assert.equal(noteFor(undefined, '2026-10-28'), null);
});

test('NOTE-3: the latest earlier note is the reminder for today', () => {
  const notes = setNote(setNote({}, KEY, '2026-10-20', { text: 'old' }), KEY, '2026-10-27', { text: 'Fix the tests' });
  assert.equal(earlierNote(notes[KEY], '2026-10-28')?.text, 'Fix the tests');
  assert.equal(earlierNote(notes[KEY], '2026-10-27')?.text, 'old');
  assert.equal(earlierNote(notes[KEY], '2026-10-20'), null);
  assert.equal(earlierNote(undefined, '2026-10-28'), null);
});

test('NOTE-3: days read as Yesterday or a short date', () => {
  assert.equal(dayLabel('2026-10-28', '2026-10-28'), 'Today');
  assert.equal(dayLabel('2026-10-27', '2026-10-28'), 'Yesterday');
  assert.equal(dayLabel('2026-10-31', '2026-11-01'), 'Yesterday', 'across a month');
  assert.equal(dayLabel('2026-10-23', '2026-10-28'), 'Fri, Oct 23');
});

test('NOTE-2: each PR keeps its latest 100 days', () => {
  let notes = {};
  for (let day = 0; day < MAX_NOTE_DAYS + 5; day += 1) {
    notes = setNote(notes, KEY, localDay(new Date(2026, 0, 1 + day, 12).getTime()), { asked: true });
  }
  const entries = (notes as Record<string, { date: string }[]>)[KEY];
  assert.equal(entries.length, MAX_NOTE_DAYS);
  assert.equal(entries[entries.length - 1].date, localDay(new Date(2026, 0, 6, 12).getTime()));
});

test('NOTE-2: stored notes survive a reload, invalid entries are dropped, and blocked storage never throws', () => {
  const data = useStorage();
  assert.deepEqual(loadNotes(), {});
  const notes = setNote({}, KEY, '2026-10-28', { text: 'Fix the tests' });
  saveNotes(notes);
  assert.deepEqual(loadNotes(), notes);
  data.set('apihub-pr-board.notes', JSON.stringify({
    [KEY]: [{ date: '2026-10-28', asked: true, text: 'ok' }, { date: 'yesterday', asked: true, text: 'x' }, { date: '2026-10-27', asked: 'yes', text: 7 }, null],
    broken: 'x',
  }));
  assert.deepEqual(loadNotes(), { [KEY]: [{ date: '2026-10-28', asked: true, text: 'ok' }] });
  data.set('apihub-pr-board.notes', '{broken');
  assert.deepEqual(loadNotes(), {});
  assert.deepEqual(parseNotes(null), {});
  useStorage(true);
  assert.deepEqual(loadNotes(), {});
  assert.doesNotThrow(() => saveNotes(notes));
});

test('NOTE-6 NOTE-7: a PR is asked today only with a checked note today, and every note counts for search', () => {
  const notes = setNote(setNote({}, KEY, '2026-10-27', { text: 'Fix the TESTS' }), KEY, '2026-10-28', { text: 'Merged soon' });
  assert.deepEqual(standupOf(notes[KEY], '2026-10-28'), { askedToday: true, noteText: 'merged soon fix the tests' });
  assert.deepEqual(standupOf(notes[KEY], '2026-10-29'), { askedToday: false, noteText: 'merged soon fix the tests' });
  assert.deepEqual(standupOf(undefined, '2026-10-28'), { askedToday: false, noteText: '' });
});
