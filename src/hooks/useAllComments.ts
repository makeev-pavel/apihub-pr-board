import { useContext, useEffect, useState } from 'react';
import { REPOSITORY } from '../config.ts';
import { ApiContext } from '../context.ts';
import { fetchAllComments } from '../github/rest.ts';
import type { AllComments } from '../github/rest.ts';
import type { Comment, DerivedPullRequest } from '../types.ts';

type AllCommentsState =
  | { status: 'loading' }
  | { status: 'ready'; comments: Comment[]; complete: boolean }
  | { status: 'error'; error: string };

// One request per PR version: a newer updatedAt means new activity, so the list is loaded again.
const allCommentsCache = new Map<string, Promise<AllComments>>();

export function useAllComments(pr: DerivedPullRequest, open: boolean): AllCommentsState {
  const api = useContext(ApiContext);
  const [state, setState] = useState<AllCommentsState>({ status: 'loading' });
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const key = pr.number + '@' + pr.updatedAt;
    let request = allCommentsCache.get(key);
    if (!request) {
      request = fetchAllComments({ number: pr.number, repository: REPOSITORY, token: api.token, restUrl: api.restUrl });
      allCommentsCache.set(key, request);
      request.catch(() => allCommentsCache.delete(key));
    }
    setState({ status: 'loading' });
    request.then(
      (result) => { if (!cancelled) setState({ status: 'ready', ...result }); },
      (error: Error) => { if (!cancelled) setState({ status: 'error', error: error.message }); },
    );
    return () => { cancelled = true; };
  }, [open, pr.number, pr.updatedAt, api.token, api.restUrl]);
  return state;
}
