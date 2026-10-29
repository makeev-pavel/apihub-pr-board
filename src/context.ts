import { createContext } from 'react';
import type { NoteEntry, Notes } from './board/notes.ts';
import { REST_URL } from './github/rest.ts';
import { DEFAULT_RULES } from './model/rules.ts';
import type { Rules } from './model/rules.ts';

// The viewer's attention rules, for components deep in the table.
export const RulesContext = createContext<Rules>(DEFAULT_RULES);

// Where the comments panel loads the full list, and the viewer's token if there is one.
interface Api {
  token: string;
  restUrl: string;
}
export const ApiContext = createContext<Api>({ token: '', restUrl: REST_URL });

// Standup notes (NOTE-1) and today's date; only the Standup cells read them, so a note re-renders only those cells.
interface NotesApi {
  notes: Notes;
  today: string;
  update: (key: string, change: Partial<Pick<NoteEntry, 'asked' | 'text'>>, day?: string) => void;
}
export const NotesContext = createContext<NotesApi>({ notes: {}, today: '', update: () => {} });
