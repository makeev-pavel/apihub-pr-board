// A typical board of ordinary PRs, generated instead of copied from a real repository. States rotate by index, so
// every CI, review, conflict, and area state appears; a seeded generator only varies texts, people, and ages.

import type { RawPullRequest } from '../../src/github/raw.ts';
import {
  agoFrom, bot, checks, conn, ISSUES_URL, label, PULLS_URL, requested, review, rollup, run, user,
} from './builders.ts';
import type { FixtureEntry } from './builders.ts';
import { PEOPLE } from './people.ts';

export const TYPICAL_SIZE = 36;
const SEED = 20261028;
const FIRST_NUMBER = 101;
const NUMBER_STEP = 3;
const MAX_AGE_DAYS = 25;
const FIRST_ISSUE = 400;
// Where between opening and now the reviews land, as a fraction of that time.
const REVIEW_POINT = 0.7;

// People who open ordinary PRs; the edge-case logins stay in the corner cases.
const AUTHORS = PEOPLE.slice(0, 8);

const AREAS = [
  { scopes: ['portal-backend', 'agent', 'api-linter-service'], tag: '[BE]', module: 'module:portal-backend' },
  { scopes: ['ui', 'api-diff', 'apispec-view'], tag: '[FE]', module: 'module:ui' },
  { scopes: ['ci', 'docs', 'release'], tag: '', module: '' },
];
const TYPES = ['feat', 'fix', 'refactor', 'test', 'perf', 'docs'];
const SUBJECTS = [
  'cache resolved references between builds', 'show the version in the breadcrumbs', 'retry webhook delivery',
  'speed up the operations list', 'validate empty request bodies', 'keep filters when switching tabs',
  'export the comparison as a file', 'log slow queries with their plan', 'trim trailing slashes in server URLs',
  'paginate the package history', 'drop the unused settings endpoint', 'explain why a rule failed',
];
const LABELS = [label('bug', 'd73a4a', 'Something is not working'), label('enhancement', 'a2eeef'),
  label('good first issue', '7057ff', 'Good for newcomers'), label('performance', 'fbca04')];
const COMMENTS = [
  'Looks good overall. Two small notes inline.',
  'Rebased on `main`, the conflict is gone.',
  'Could you add a test for the **empty** case?\n\n- [x] happy path\n- [ ] empty list',
  'CI is flaky on this job; restarted it.',
  '> Do we need the cache at all?\n\nYes: without it a build takes four times longer.',
];
const CI_STATES = ['SUCCESS', 'FAILURE', 'PENDING', null, 'SUCCESS', 'SUCCESS'];
const MERGE_STATES = ['MERGEABLE', 'MERGEABLE', 'CONFLICTING', 'MERGEABLE', 'UNKNOWN', 'MERGEABLE', 'MERGEABLE'];

// mulberry32: a tiny seeded generator, enough for varied but repeatable fixtures.
function seeded(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, pick: <T>(list: T[]): T => list[Math.floor(next() * list.length)] };
}

function reviewsFor(kind: number, author: string, others: string[], at: string) {
  const [first, second] = others.filter((p) => p !== author);
  const decided = { 0: [review('APPROVED', first, at)], 1: [], 2: [review('CHANGES_REQUESTED', first, at)],
    3: [review('APPROVED', first, at), review('APPROVED', second, at)], 4: [] }[kind] || [];
  const waiting = kind === 3 || kind === 4 ? [requested(others.find((p) => p !== author && p !== first && p !== second)!)] : [];
  return { latestOpinionatedReviews: conn(decided), reviewRequests: conn(waiting) };
}

export function typicalNodes(now: number): FixtureEntry[] {
  const random = seeded(SEED);
  const ago = agoFrom(now);
  return Array.from({ length: TYPICAL_SIZE }, (_, i): FixtureEntry => {
    const area = AREAS[i % AREAS.length];
    const dependabot = i % 9 === 4;
    const author = dependabot ? 'dependabot' : random.pick(AUTHORS);
    const scope = random.pick(area.scopes);
    const title = dependabot
      ? 'chore(deps): bump vite from 8.1.' + i + ' to 8.2.0 in /' + (area.tag === '[BE]' ? 'backend' : 'frontend')
      : i % 10 === 7 ? 'Add ' + random.pick(SUBJECTS) : random.pick(TYPES) + '(' + scope + '): ' + random.pick(SUBJECTS);
    const createdAt = ago(Math.floor(random.next() * MAX_AGE_DAYS), Math.floor(random.next() * 23));
    // Activity happens between the opening and now, and the PR's last update is its latest activity.
    const openedMs = Date.parse(createdAt);
    const sinceOpening = (fraction: number) => new Date(openedMs + fraction * (now - openedMs)).toISOString();
    const commentTimes = Array.from({ length: i % 4 }, () => random.next()).sort().map(sinceOpening);
    const reviewedAt = sinceOpening(REVIEW_POINT);
    const updatedAt = [sinceOpening(random.next()), reviewedAt, ...commentTimes].sort().at(-1)!;
    const ci = CI_STATES[i % CI_STATES.length];
    const failed = [run('unit (' + scope + ')', 'FAILURE', 'CI'), ...(i % 4 === 1 ? [run('lint', 'TIMED_OUT', 'Lint')] : [])];
    const issueKind = i % 6;
    const labels = [...(area.module && i % 2 === 0 ? [label(area.module, '1d76db')] : []), ...(i % 3 === 0 ? [random.pick(LABELS)] : [])];
    const node: RawPullRequest = {
      number: FIRST_NUMBER + i * NUMBER_STEP,
      title,
      url: PULLS_URL,
      isDraft: i % 8 === 5,
      createdAt,
      updatedAt,
      baseRefName: i % 11 === 6 ? 'develop' : 'main',
      mergeable: MERGE_STATES[i % MERGE_STATES.length],
      author: dependabot ? bot(author) : user(author),
      assignees: conn(dependabot ? [] : [user(author), ...(i % 5 === 0 ? [user(random.pick(AUTHORS))] : [])]),
      labels: conn(labels),
      closingIssuesReferences: conn(issueKind < 4 && !dependabot
        ? [{ number: FIRST_ISSUE + i, title: (area.tag ? area.tag + ' ' : '') + 'Users ask to ' + random.pick(SUBJECTS), url: ISSUES_URL }]
        : []),
      projectsV2: conn(issueKind === 4 ? [{ title: 'Widgets sprint' }] : []),
      commits: rollup(ci, ci === 'FAILURE' ? checks([...failed, run('build', 'SUCCESS', 'CI')]) : undefined),
      comments: conn(commentTimes.map((at) => ({
        createdAt: at, author: user(random.pick(AUTHORS)), url: PULLS_URL, body: random.pick(COMMENTS),
      }))),
      reviews: conn([]),
      ...reviewsFor(i % 5, author, AUTHORS, reviewedAt),
    };
    return { node, note: null };
  });
}
