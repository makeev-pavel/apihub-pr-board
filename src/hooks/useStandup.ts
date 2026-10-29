import { useMemo, useRef } from 'react';
import { standupOf } from '../board/notes.ts';
import type { Notes } from '../board/notes.ts';
import { pullRequestKey } from '../model/report.ts';
import type { DerivedPullRequest } from '../types.ts';

// Adds what the notes say to each PR, for the Not asked today filter and note: (NOTE-6, NOTE-7). A PR whose notes did
// not change keeps the same object, so the memoized rows of the other PRs do not render again.
export function useStandup(prs: DerivedPullRequest[], notes: Notes, today: string): DerivedPullRequest[] {
  const cache = useRef(new WeakMap<DerivedPullRequest, DerivedPullRequest>());
  return useMemo(() => prs.map((pr) => {
    const standup = standupOf(notes[pullRequestKey(pr)], today);
    const previous = cache.current.get(pr);
    if (previous && previous.standup?.askedToday === standup.askedToday && previous.standup.noteText === standup.noteText) return previous;
    const next = { ...pr, standup };
    cache.current.set(pr, next);
    return next;
  }), [prs, notes, today]);
}
