// The view (search, filters, quick filters, and sort), its URL query, and the rows it lets through.

import { AREAS } from '../model/areas.ts';
import { matchesQuery } from '../model/search.ts';
import type { ParsedQuery } from '../model/search.ts';
import type { AreaId, DerivedPullRequest } from '../types.ts';
import { CI, MERGE, REVIEW } from './states.ts';

interface QuickFilter {
  id: string;
  label: string;
  tone: string;
  test: (pr: DerivedPullRequest) => boolean;
}

export const QUICK: QuickFilter[] = [
  { id: 'ci', label: 'CI failing', tone: 'bad', test: (pr) => pr.ci === 'failing' },
  { id: 'review', label: 'Without approval', tone: 'warn', test: (pr) => pr.review !== 'approved' },
  { id: 'conflicts', label: 'Merge conflicts', tone: 'bad', test: (pr) => pr.mergeable === 'conflicts' },
  { id: 'attention', label: 'Need attention', tone: 'bad', test: (pr) => pr.attention.length > 0 },
];

export type SortKey = 'number' | 'title' | 'author' | 'ci' | 'review' | 'merge' | 'age' | 'attention';
type SortDir = 'asc' | 'desc';

const SORTS: Record<SortKey, (pr: DerivedPullRequest) => number | string> = {
  number: (pr) => pr.number,
  title: (pr) => pr.title.toLowerCase(),
  author: (pr) => pr.authorKey.toLowerCase(),
  ci: (pr) => CI[pr.ci].rank,
  review: (pr) => REVIEW[pr.review].rank,
  merge: (pr) => MERGE[pr.mergeable].rank,
  age: (pr) => -Date.parse(pr.createdAt),
  attention: (pr) => pr.attention.length,
};
const isSortKey = (value: string | null): value is SortKey => value !== null && value in SORTS;

// Text columns sort A to Z first; the others start with the highest value.
export function firstDirection(key: SortKey): SortDir {
  return key === 'title' || key === 'author' ? 'asc' : 'desc';
}

type AreaFilter = 'all' | 'other' | AreaId;
type DraftFilter = 'all' | 'ready' | 'draft';
export const AREA_OPTIONS: [AreaFilter, string][] = [['all', 'All'], ...AREAS.map((a): [AreaFilter, string] => [a.id, a.label]), ['other', 'Other']];
export const DRAFT_OPTIONS: [DraftFilter, string][] = [['all', 'All'], ['ready', 'Ready for review'], ['draft', 'Drafts']];

// Authors: null shows people (no bots), 'all' and 'bots' are presets, a list names the selected logins.
export type AuthorsFilter = null | 'all' | 'bots' | string[];

export interface View {
  q: string;
  authors: AuthorsFilter;
  draft: DraftFilter;
  area: AreaFilter;
  quick: string[];
  sort: SortKey;
  dir: SortDir;
}

export const DEFAULT_VIEW: View = { q: '', authors: null, draft: 'ready', area: 'all', quick: [], sort: 'attention', dir: 'desc' };

// The view a URL query describes; unknown or missing values fall back to the defaults.
export function parseView(search: string): View {
  const view = { ...DEFAULT_VIEW };
  const params = new URLSearchParams(search);
  const q = params.get('q');
  if (q !== null) view.q = q;
  const authors = params.get('authors');
  if (authors !== null) {
    view.authors = authors === 'all' || authors === 'bots' ? authors : authors.split(',').filter(Boolean);
  }
  const draft = DRAFT_OPTIONS.find(([id]) => id === params.get('draft'));
  if (draft) view.draft = draft[0];
  const area = AREA_OPTIONS.find(([id]) => id === params.get('area'));
  if (area) view.area = area[0];
  const quick = params.get('quick');
  if (quick !== null) {
    view.quick = quick.split(',').filter((id) => QUICK.some((f) => f.id === id));
  }
  const sort = params.get('sort');
  if (isSortKey(sort)) view.sort = sort;
  const dir = params.get('dir');
  if (dir === 'asc' || dir === 'desc') view.dir = dir;
  return view;
}
// The URL query for a view, without the defaults, so the default view has a clean address.
export function viewQuery(view: View): string {
  const params = new URLSearchParams();
  if (view.q) params.set('q', view.q);
  if (view.authors) params.set('authors', typeof view.authors === 'string' ? view.authors : view.authors.join(','));
  if (view.draft !== DEFAULT_VIEW.draft) params.set('draft', view.draft);
  if (view.area !== DEFAULT_VIEW.area) params.set('area', view.area);
  if (view.quick.length) params.set('quick', view.quick.join(','));
  if (view.sort !== DEFAULT_VIEW.sort || view.dir !== DEFAULT_VIEW.dir) {
    params.set('sort', view.sort);
    params.set('dir', view.dir);
  }
  return params.toString();
}

export function readView(): View {
  return parseView(window.location.search);
}

export function writeView(view: View) {
  const query = viewQuery(view);
  history.replaceState(null, '', window.location.pathname + (query ? '?' + query : ''));
}

// The PRs the authors, draft status, area, and search let through. Quick filters count against this list.
export function filterPullRequests(prs: DerivedPullRequest[], view: Pick<View, 'draft' | 'area'>, authors: Set<string>,
  query: ParsedQuery): DerivedPullRequest[] {
  return prs.filter((pr) => {
    if (!authors.has(pr.authorKey)) return false;
    if (view.draft === 'ready' && pr.draft) return false;
    if (view.draft === 'draft' && !pr.draft) return false;
    if (view.area === 'other' && pr.areas.length) return false;
    if (view.area !== 'all' && view.area !== 'other' && !pr.areas.includes(view.area)) return false;
    return matchesQuery(pr, query);
  });
}

// The rows of the table: the active quick filters on top, then the sort, newest PR first on ties.
export function visibleRows(prs: DerivedPullRequest[], view: Pick<View, 'quick' | 'sort' | 'dir'>): DerivedPullRequest[] {
  const tests = QUICK.filter((q) => view.quick.includes(q.id));
  const key = SORTS[view.sort];
  const sign = view.dir === 'asc' ? 1 : -1;
  return prs.filter((pr) => tests.every((q) => q.test(pr))).sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka < kb) return -sign;
    if (ka > kb) return sign;
    return b.number - a.number;
  });
}
