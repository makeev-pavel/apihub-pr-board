import { createContext } from 'react';
import type { Notes } from './board/notes.ts';
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

// Notes per PR (NOTE-1); only the note buttons read them, so a note re-renders only those buttons.
interface NotesApi {
  notes: Notes;
  update: (key: string, text: string) => void;
  // The last change could not be written to this browser's storage.
  saveFailed: boolean;
}
export const NotesContext = createContext<NotesApi>({ notes: {}, update: () => {}, saveFailed: false });
