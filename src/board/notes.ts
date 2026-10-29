// Standup notes per PR and day, kept in this browser (NOTE-1, NOTE-2). Storage can be blocked, so every access is
// guarded, and a stored entry is checked field by field.

import type { Standup } from '../types.ts';

export interface NoteEntry {
  // The viewer's local calendar day, YYYY-MM-DD.
  date: string;
  asked: boolean;
  text: string;
}

// Keyed by pullRequestKey; each list is newest first.
export type Notes = Record<string, NoteEntry[]>;

export const MAX_NOTE_DAYS = 100;
const NOTES_KEY = 'apihub-pr-board.notes';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');

export function localDay(time: number): string {
  const date = new Date(time);
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

// Noon keeps the arithmetic clear of daylight saving changes.
function noonOf(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date, 12);
}

export function dayLabel(day: string, today: string): string {
  if (day === today) return 'Today';
  if (localDay(noonOf(today).getTime() - DAY_MS) === day) return 'Yesterday';
  return noonOf(day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function noteFor(entries: NoteEntry[] | undefined, day: string): NoteEntry | null {
  return (entries || []).find((entry) => entry.date === day) || null;
}

// The newest note from before the day: yesterday's promise, read today.
export function earlierNote(entries: NoteEntry[] | undefined, day: string): NoteEntry | null {
  return (entries || []).find((entry) => entry.date < day) || null;
}

export function standupOf(entries: NoteEntry[] | undefined, day: string): Standup {
  const today = noteFor(entries, day);
  return { askedToday: !!today && today.asked, noteText: (entries || []).map((entry) => entry.text).filter(Boolean).join(' ').toLowerCase() };
}

// Changes one day's note. Text marks the PR as asked; a note with nothing left in it is removed.
export function setNote(notes: Notes, key: string, day: string, change: Partial<Pick<NoteEntry, 'asked' | 'text'>>): Notes {
  const entries = notes[key] || [];
  const current = noteFor(entries, day) || { date: day, asked: false, text: '' };
  const text = change.text !== undefined ? change.text.trim() : current.text;
  const asked = change.asked !== undefined ? change.asked : current.asked || (change.text !== undefined && text !== '');
  const others = entries.filter((entry) => entry.date !== day);
  const next = asked || text ? [...others, { date: day, asked, text }] : others;
  next.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const result = { ...notes, [key]: next.slice(0, MAX_NOTE_DAYS) };
  if (!result[key].length) delete result[key];
  return result;
}

function parseEntry(value: unknown): NoteEntry | null {
  const entry = value as Partial<NoteEntry> | null;
  if (!entry || typeof entry !== 'object' || typeof entry.date !== 'string' || !DAY.test(entry.date)) return null;
  if (typeof entry.asked !== 'boolean' || typeof entry.text !== 'string') return null;
  return { date: entry.date, asked: entry.asked, text: entry.text };
}

export function parseNotes(value: unknown): Notes {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const notes: Notes = {};
  for (const [key, list] of Object.entries(value)) {
    if (!Array.isArray(list)) continue;
    const entries = list.map(parseEntry).filter((entry): entry is NoteEntry => entry !== null).slice(0, MAX_NOTE_DAYS);
    if (entries.length) notes[key] = entries;
  }
  return notes;
}

export function loadNotes(): Notes {
  try { return parseNotes(JSON.parse(localStorage.getItem(NOTES_KEY) || 'null')); } catch { return {}; }
}

export function saveNotes(notes: Notes) {
  try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); } catch { /* storage is blocked; notes live only for this page load */ }
}
