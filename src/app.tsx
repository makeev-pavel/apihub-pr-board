import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, Dispatch, FormEvent, KeyboardEvent, MouseEvent, PointerEvent, ReactNode, SetStateAction } from 'react';
import { REPOSITORY } from './config.ts';
import { fetchOpenPullRequests } from './github/graphql.ts';
import { fetchAllComments, REST_URL } from './github/rest.ts';
import type { AllComments } from './github/rest.ts';
import { markdownText, renderMarkdown } from './markdown.ts';
import { AREAS } from './model/areas.ts';
import { derive } from './model/derive.ts';
import { parseReport } from './model/report.ts';
import { DEFAULT_RULES, isBot, TITLE_TYPES } from './model/rules.ts';
import { matchesQuery, parseQuery, SEARCH_QUALIFIERS, toggleLabelFilter } from './model/search.ts';
import type { Rules } from './model/rules.ts';
import { repositoryName } from './repository.ts';
import {
  DEFAULT_SETTINGS, DENSITIES, isValidStaleDays, loadSettings, MAX_STALE_DAYS, MIN_STALE_DAYS, parseList, rulesAreDefault,
  saveSettings, THEMES,
} from './settings.ts';
import type { Settings } from './settings.ts';
import type {
  Actor, AreaId, CiState, Comment, DerivedPullRequest, DevConfig, FailedCheck, Label, MergeState, PullRequest, Report, RequestedReviewer, Reviewer, ReviewState,
} from './types.ts';

declare global {
  interface Window {
    PR_BOARD_DEV?: DevConfig;
  }
}

const DATA_URL = 'prs.json';
const TOKEN_KEY = 'apihub-pr-board.token';
const TOKEN_HELP_URL = 'https://github.com/settings/personal-access-tokens/new';
const COPIED_FEEDBACK_MS = 1800;
const CLOCK_TICK_MS = 60 * 1000;
const POPOVER_GAP_PX = 6;
const POPOVER_EDGE_PX = 16;
// Open a popover upward when less than this much room is left below its trigger.
const POPOVER_FLIP_PX = 260;
const ATTENTION_POPOVER_PX = 300;
// Comments open in a panel along the right edge of the window, so long reports have the full height.
const COMMENTS_PANEL_PX = 560;
const COMMENTS_PANEL_STYLE: CSSProperties = { top: POPOVER_EDGE_PX, right: POPOVER_EDGE_PX, bottom: POPOVER_EDGE_PX, width: COMMENTS_PANEL_PX };
const CHECKS_POPOVER_PX = 400;
const REVIEW_POPOVER_PX = 320;
const RULES_POPOVER_PX = 440;
const UPDATE_POPOVER_PX = 280;
// The reviewer state that stands behind each review code; the pill counts these reviewers.
const DECISION_BY_REVIEW: Record<ReviewState, string | null> = {
  approved: 'APPROVED', changes_requested: 'CHANGES_REQUESTED', none: null,
};
const REVIEW_SECTIONS = [
  { state: 'APPROVED', title: 'Approved by' },
  { state: 'CHANGES_REQUESTED', title: 'Changes requested by' },
  { state: 'DISMISSED', title: 'Dismissed reviews' },
];
// Aggregate jobs that fail whenever anything else fails; listed last so the real cause comes first.
const SUMMARY_CHECKS = new Set(['ci-ok']);
const CONCLUSION_LABELS: Record<string, string> = {
  failure: 'Failed', timed_out: 'Timed out', startup_failure: 'Did not start', action_required: 'Action required', error: 'Error',
};
const COLUMNS_KEY = 'apihub-pr-board.columns';
const MIN_COLUMN_PX = 56;
const RESIZE_STEP_PX = 16;
const VISIBLE_LABELS = 4;
// Header cells stack above the rows from this layer up; see .col-resizer in styles.css.
const HEADER_LAYER = 2;
// Relative luminance above which a label background needs dark text.
const LIGHT_LABEL_LUMINANCE = 0.45;
const DEV = window.PR_BOARD_DEV || null;

interface StateInfo {
  short: string;
  label: string;
  tone: string;
  rank: number;
  hint?: string;
}

// Cells show the short code; the full label is in the tooltip, the accessible name, and the legend.
const CI: Record<CiState, StateInfo> = {
  failing: { short: 'F', label: 'Failing', tone: 'bad', rank: 0, hint: 'At least one check failed' },
  running: { short: 'R', label: 'Running', tone: 'warn running', rank: 1, hint: 'Checks are still running' },
  none: { short: '—', label: 'No checks', tone: 'idle', rank: 2, hint: 'No checks reported for the last commit' },
  passing: { short: 'P', label: 'Passing', tone: 'good', rank: 3, hint: 'All checks passed' },
};
const REVIEW: Record<ReviewState, StateInfo> = {
  changes_requested: { short: 'CR', label: 'Changes requested', tone: 'bad', rank: 0 },
  none: { short: '—', label: 'No approval', tone: 'idle', rank: 1 },
  approved: { short: '✓', label: 'Approved', tone: 'good', rank: 2 },
};
const MERGE: Record<MergeState, StateInfo> = {
  conflicts: { short: 'C', label: 'Conflicts', tone: 'bad', rank: 0, hint: 'Rebase or merge the target branch' },
  unknown: { short: '?', label: 'Checking', tone: 'idle', rank: 1, hint: 'GitHub has not computed mergeability yet' },
  clean: { short: 'OK', label: 'No conflicts', tone: 'good', rank: 2, hint: 'Merges cleanly into the target branch' },
};
const LEGEND: [string, Record<string, StateInfo>][] = [['CI', CI], ['Review', REVIEW], ['Conflicts', MERGE]];

interface QuickFilter {
  id: string;
  label: string;
  tone: string;
  test: (pr: DerivedPullRequest) => boolean;
}

const QUICK: QuickFilter[] = [
  { id: 'ci', label: 'CI failing', tone: 'bad', test: (pr) => pr.ci === 'failing' },
  { id: 'review', label: 'Without approval', tone: 'warn', test: (pr) => pr.review !== 'approved' },
  { id: 'conflicts', label: 'Merge conflicts', tone: 'bad', test: (pr) => pr.mergeable === 'conflicts' },
  { id: 'attention', label: 'Need attention', tone: 'bad', test: (pr) => pr.attention.length > 0 },
];

type SortKey = 'number' | 'title' | 'author' | 'ci' | 'review' | 'merge' | 'age' | 'attention';
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

interface Column {
  id: string;
  sort: SortKey | null;
  label: string;
  cls: string;
  width: number;
  hint?: string;
  // Always shown: a row makes no sense without it.
  required?: boolean;
}

type Widths = Record<string, number>;

const COLUMNS: Column[] = [
  { id: 'number', sort: 'number', label: '#', cls: 'c-num', width: 72, required: true },
  { id: 'title', sort: 'title', label: 'Pull request', cls: 'c-title', width: 460, required: true },
  { id: 'author', sort: 'author', label: 'Author', cls: 'c-person', width: 170 },
  { id: 'ci', sort: 'ci', label: 'CI', cls: 'c-state', width: 60 },
  { id: 'review', sort: 'review', label: 'Review', cls: 'c-state', width: 80 },
  { id: 'merge', sort: 'merge', label: 'Conflicts', cls: 'c-state', width: 96 },
  { id: 'age', sort: 'age', label: 'Age · activity', cls: 'c-age', width: 132 },
  { id: 'assignee', sort: null, label: 'Assignee', cls: 'c-person', width: 170 },
  { id: 'comment', sort: null, label: 'Last comment', cls: 'c-comment', width: 300 },
  { id: 'attention', sort: 'attention', label: 'Attention', cls: 'c-attn', width: 104, hint: 'Click an icon to see why the PR needs attention' },
];
const DEFAULT_WIDTHS: Widths = Object.fromEntries(COLUMNS.map((c) => [c.id, c.width]));
// Columns that absorb spare width so the table always fills the window.
const FLEX_COLUMNS = ['title', 'comment'];

// Widen flexible columns until the table fills the available width. The column being resized is
// left alone so it follows the pointer, and saved widths stay as the user set them. When the flexible columns are
// hidden or being resized, the last visible column takes the spare width.
function fitToWidth(base: Widths, available: number, resizingId: string | null, columns: Column[]): Widths {
  const total = columns.reduce((sum, c) => sum + base[c.id], 0);
  if (!available || total >= available) return base;
  let flex = FLEX_COLUMNS.filter((id) => id !== resizingId && columns.some((c) => c.id === id));
  if (!flex.length) flex = [columns[columns.length - 1].id];
  const extra = available - total;
  const share = Math.floor(extra / flex.length);
  const fitted = { ...base };
  flex.forEach((id, i) => { fitted[id] += share + (i === 0 ? extra - share * flex.length : 0); });
  return fitted;
}

type AreaFilter = 'all' | 'other' | AreaId;
type DraftFilter = 'all' | 'ready' | 'draft';
const AREA_OPTIONS: [AreaFilter, string][] = [['all', 'All'], ...AREAS.map((a): [AreaFilter, string] => [a.id, a.label]), ['other', 'Other']];
const DRAFT_OPTIONS: [DraftFilter, string][] = [['all', 'All'], ['ready', 'Ready for review'], ['draft', 'Drafts']];

// Authors: null shows people (no bots), 'all' and 'bots' are presets, a list names the selected logins.
type AuthorsFilter = null | 'all' | 'bots' | string[];

interface View {
  q: string;
  authors: AuthorsFilter;
  draft: DraftFilter;
  area: AreaFilter;
  quick: string[];
  sort: SortKey;
  dir: SortDir;
}

const DEFAULT_VIEW: View = { q: '', authors: null, draft: 'ready', area: 'all', quick: [], sort: 'attention', dir: 'desc' };

// The viewer's attention rules, for components deep in the table.
const RulesContext = createContext<Rules>(DEFAULT_RULES);

// Where the comments panel loads the full list, and the viewer's token if there is one.
interface Api {
  token: string;
  restUrl: string;
}
const ApiContext = createContext<Api>({ token: '', restUrl: REST_URL });

function readToken(): string {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
function storeToken(token: string) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage is blocked; the token lives only for this page load */ }
}

// Column widths are kept in this browser under their own key, apart from the other settings.
function readColumnWidths(): Widths {
  try {
    const saved: Record<string, unknown> = JSON.parse(localStorage.getItem(COLUMNS_KEY) || '{}');
    return Object.fromEntries(Object.entries(saved).filter((pair): pair is [string, number] => {
      const [id, w] = pair;
      return id in DEFAULT_WIDTHS && typeof w === 'number' && Number.isFinite(w) && w >= MIN_COLUMN_PX;
    }));
  } catch {
    return {};
  }
}
function writeColumnWidths(widths: Widths) {
  try {
    if (Object.keys(widths).length) localStorage.setItem(COLUMNS_KEY, JSON.stringify(widths)); else localStorage.removeItem(COLUMNS_KEY);
  } catch { /* storage is blocked; widths live only for this page load */ }
}

function readView(): View {
  const view = { ...DEFAULT_VIEW };
  const params = new URLSearchParams(window.location.search);
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
function writeView(view: View) {
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
  const query = params.toString();
  history.replaceState(null, '', window.location.pathname + (query ? '?' + query : ''));
}

function plural(n: number, word: string): string {
  return n + ' ' + word + (n === 1 ? '' : 's');
}
function formatAge(days: number): string {
  return days === 0 ? 'today' : plural(days, 'day');
}
function formatAgo(iso: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60000);
  if (minutes < 60) return minutes <= 1 ? 'just now' : minutes + ' min ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return plural(hours, 'hour') + ' ago';
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : days + ' days ago';
}
function displayLogin(actor: Actor): string {
  return actor.login.replace(/\[bot\]$/, '');
}
function initials(login: string): string {
  const parts = login.replace(/\[bot\]$/, '').split(/[-_.\s]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : login.slice(0, 2)).toUpperCase();
}

function Avatar({ actor, small = false }: { actor: Actor | null; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  const cls = 'avatar' + (small ? ' sm' : '');
  if (!actor || !actor.avatarUrl || failed) {
    return <span className={cls} aria-hidden="true">{actor ? initials(actor.login) : '?'}</span>;
  }
  return <img className={cls} src={actor.avatarUrl} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

function Person({ actor }: { actor: Actor | null }) {
  const { extraBots } = useContext(RulesContext);
  if (!actor) {
    return (
      <div className="person ghost" title="The author's GitHub account was deleted">
        <Avatar actor={null} /><span className="login">ghost</span>
      </div>
    );
  }
  return (
    <div className="person">
      <Avatar actor={actor} />
      <span className="login">{displayLogin(actor)}</span>
      {isBot(actor, extraBots) ? <span className="chip bot">bot</span> : null}
    </div>
  );
}

function labelTextColor(hex: string): string {
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > LIGHT_LABEL_LUMINANCE ? 'var(--label-ink-dark)' : 'var(--label-ink-light)';
}

function LabelChip({ label, active, onToggle }: { label: Label; active: boolean; onToggle: (name: string) => void }) {
  const style = label.color ? { background: '#' + label.color, color: labelTextColor(label.color) } : undefined;
  const hint = (label.description ? label.description + '. ' : '') + (active ? 'Click to remove this filter' : 'Click to filter by this label');
  return (
    <button type="button" className={'label-chip' + (active ? ' active' : '')} style={style} title={hint}
      aria-pressed={active} onClick={() => onToggle(label.name)}>{label.name}</button>
  );
}

function LabelList({ labels, activeLabels, onToggle }: { labels: Label[]; activeLabels: Set<string>; onToggle: (name: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? labels : labels.slice(0, VISIBLE_LABELS);
  const hidden = labels.length - shown.length;
  return (
    <>
      {shown.map((l) => <LabelChip key={l.name} label={l} active={activeLabels.has(l.name.toLowerCase())} onToggle={onToggle} />)}
      {hidden > 0 ? (
        <button type="button" className="label-more" title={labels.slice(VISIBLE_LABELS).map((l) => l.name).join(', ')}
          onClick={() => setExpanded(true)}>+{hidden}</button>
      ) : null}
      {expanded && labels.length > VISIBLE_LABELS ? <button type="button" className="label-more" onClick={() => setExpanded(false)}>less</button> : null}
    </>
  );
}

// The issue the PR closes (the Development field). Without one, the project it was added to instead.
function IssueLine({ pr }: { pr: PullRequest }) {
  if (pr.issues.length) {
    return (
      <div className="issue-line">{pr.issues.map((issue, i) => {
        const text = (
          <>
            <span className="issue-title">{issue.title}</span>
            {issue.number ? <span className="issue-number">(#{issue.number})</span> : null}
          </>
        );
        return (
          <span key={i} className="issue-ref" title={'Closes ' + issue.title + (issue.number ? ' (#' + issue.number + ')' : '')}>
            <span className="issue-icon" aria-hidden="true">↳</span>
            <a className="issue-text" href={issue.url} target="_blank" rel="noopener">{text}</a>
          </span>
        );
      })}</div>
    );
  }
  if (pr.projects && pr.projects.length) {
    return <div className="issue-line muted-line"><span className="issue-icon" aria-hidden="true">↳</span>No issue · in {pr.projects.join(', ')}</div>;
  }
  return null;
}

function Pill({ state, hint }: { state: StateInfo; hint?: string }) {
  const tooltip = state.label + (hint || state.hint ? ': ' + (hint || state.hint) : '');
  return <span className={'pill short ' + state.tone} title={tooltip} aria-label={state.label}>{state.short}</span>;
}

function useDismiss(open: boolean, setOpen: Dispatch<SetStateAction<boolean>>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (event: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);
  return ref;
}

// Popovers are position: fixed so the scrolling table container cannot clip them.
// Page scroll closes them; scrolling inside the popover itself does not.
function usePopover(width: number) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties | undefined>(undefined);
  const ref = useDismiss(open, setOpen);
  useEffect(() => {
    if (!open) return undefined;
    const onScroll = (event: Event) => {
      if (!(ref.current && ref.current.contains(event.target as Node))) setOpen(false);
    };
    const close = () => setOpen(false);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open, ref]);

  const toggle = (event: MouseEvent<HTMLElement>) => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const horizontal = rect.left + width > window.innerWidth - POPOVER_EDGE_PX
      ? { right: Math.max(POPOVER_EDGE_PX, window.innerWidth - rect.right) }
      : { left: Math.max(POPOVER_EDGE_PX, rect.left) };
    const vertical = window.innerHeight - rect.bottom < POPOVER_FLIP_PX
      ? { bottom: window.innerHeight - rect.top + POPOVER_GAP_PX }
      : { top: rect.bottom + POPOVER_GAP_PX };
    setPosition({ ...horizontal, ...vertical, width });
    setOpen(true);
  };
  return { open, position, ref, toggle };
}

function AttentionBadge({ reasons, number }: { reasons: string[]; number: number }) {
  const { open, position, ref, toggle } = usePopover(ATTENTION_POPOVER_PX);
  const label = plural(reasons.length, 'problem');
  return (
    <div className="attn" ref={ref}>
      <button type="button" className="attn-icon" aria-expanded={open} aria-label={'PR #' + number + ': ' + label}
        title={reasons.join('\n')} onClick={toggle}>
        <span aria-hidden="true">!</span>{reasons.length > 1 ? <span className="attn-count">{reasons.length}</span> : null}
      </button>
      {open ? (
        <div className="popover attn-popover" role="dialog" aria-label={'Why PR #' + number + ' needs attention'} style={position}>
          <strong className="popover-title">{label}</strong>
          <ul>{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}

function ReviewCell({ pr, now }: { pr: DerivedPullRequest; now: number }) {
  const { open, position, ref, toggle } = usePopover(REVIEW_POPOVER_PX);
  const state = REVIEW[pr.review];
  const waiting = pr.requestedReviewers;
  const approvers = pr.reviewers.filter((r) => r.state === 'APPROVED').map((r) => r.login);
  const decided = pr.reviewers.filter((r) => r.state === DECISION_BY_REVIEW[pr.review]).length;
  const accessibleName = state.label + (decided > 1 ? ' by ' + decided + ' reviewers' : '')
    + (waiting.length ? ', ' + plural(waiting.length, 'pending reviewer') : '') + ' on PR #' + pr.number + '. Show reviewers';
  const tooltip = [
    approvers.length ? 'Approved by ' + approvers.join(', ') : state.label,
    waiting.length ? 'Waiting for ' + waiting.map((r) => r.login).join(', ') : '',
  ].filter(Boolean).join('. ');
  const reviewer = (r: Reviewer | RequestedReviewer) => {
    const team = 'team' in r && r.team;
    const at = 'at' in r ? r.at : null;
    return (
      <li key={r.login}>
        <Avatar actor={r} small />
        <span className="who">{team ? '@' + r.login : displayLogin(r)}</span>
        {team ? <span className="chip">team</span> : null}
        {at ? <span className="when" title={new Date(at).toUTCString()}>{formatAgo(at, now)}</span> : null}
      </li>
    );
  };
  return (
    <div className="review-wrap" ref={ref}>
      <button type="button" className={'pill short ' + state.tone + ' as-button'} aria-expanded={open}
        aria-label={accessibleName} title={tooltip} onClick={toggle}>
        {state.short}{decided > 1 ? <sup>{decided}</sup> : null}
      </button>
      {waiting.length ? <span className="pending" aria-hidden="true" title={'Waiting for ' + plural(waiting.length, 'reviewer')}>◷{waiting.length}</span> : null}
      {open ? (
        <div className="popover review-popover" role="dialog" aria-label={'Reviewers of PR #' + pr.number} style={position}>
          {REVIEW_SECTIONS.map(({ state: s, title }) => {
            const list = pr.reviewers.filter((r) => r.state === s);
            return list.length ? <section key={s}><strong className="popover-title">{title}</strong><ul className="people">{list.map(reviewer)}</ul></section> : null;
          })}
          {waiting.length ? <section><strong className="popover-title">Waiting for review from</strong><ul className="people">{waiting.map(reviewer)}</ul></section> : null}
          {!pr.reviewers.length && !waiting.length ? <p className="muted">No reviews yet, and nobody is requested as a reviewer.</p> : null}
          <a className="popover-footer" href={pr.url} target="_blank" rel="noopener">Open the PR on GitHub</a>
        </div>
      ) : null}
    </div>
  );
}

interface CheckGroup extends FailedCheck {
  count: number;
  summary: boolean;
}

// The same job can report from several workflows or events; show it once with a count.
function groupChecks(failed: FailedCheck[]): CheckGroup[] {
  const groups = new Map<string, CheckGroup>();
  for (const c of failed) {
    const key = [c.name, c.workflow, c.conclusion, c.description].join('|');
    const group = groups.get(key) || { ...c, count: 0, summary: SUMMARY_CHECKS.has(c.name) };
    group.count += 1;
    groups.set(key, group);
  }
  return Array.from(groups.values()).sort((a, b) => Number(a.summary) - Number(b.summary));
}

function CiCell({ pr }: { pr: DerivedPullRequest }) {
  const { open, position, ref, toggle } = usePopover(CHECKS_POPOVER_PX);
  const state = CI[pr.ci];
  if (pr.ci !== 'failing') return <Pill state={state} />;
  const checks = pr.checks;
  const failed = checks ? groupChecks(checks.failed) : [];
  const summary = failed.length ? plural(failed.length, 'failed check') : 'Failed checks';
  const tooltip = failed.length ? summary + ': ' + failed.map((c) => c.name).join(', ') : state.hint;
  return (
    <div className="ci-wrap" ref={ref}>
      <button type="button" className={'pill short ' + state.tone + ' as-button'} aria-expanded={open}
        aria-label={summary + ' on PR #' + pr.number} title={tooltip} onClick={toggle}>
        {state.short}{failed.length > 1 ? <sup>{failed.length}</sup> : null}
      </button>
      {open ? (
        <div className="popover checks-popover" role="dialog" aria-label={summary + ' on PR #' + pr.number} style={position}>
          <strong className="popover-title">{summary}{checks ? ' of ' + checks.total : ''}</strong>
          {!checks ? <p className="muted">Check details were not collected for this PR.</p> : null}
          {checks && !failed.length ? <p className="muted">GitHub reports CI as failing, but no failed check is among the {checks.total > 100 ? 'first 100' : checks.total} checks read.</p> : null}
          {failed.length ? (
            <ul className="check-list">
              {failed.map((c, i) => (
                <li key={i}>
                  <div className="check-name">
                    {c.url ? <a href={c.url} target="_blank" rel="noopener">{c.name}</a> : c.name}
                    {c.count > 1 ? <> <span className="check-count" title={'Reported ' + c.count + ' times'}>×{c.count}</span></> : null}
                  </div>
                  <div className="check-meta">
                    {c.workflow ? <span>{c.workflow}</span> : null}
                    {c.summary ? <span className="chip" title="Fails when any other required check fails">summary job</span> : null}
                    {c.conclusion !== 'failure' ? <span className="chip">{CONCLUSION_LABELS[c.conclusion] || c.conclusion}</span> : null}
                    {c.description ? <span>{c.description}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          {checks && !checks.complete ? <p className="muted">Only the first 100 of {checks.total} checks were read; others may have failed too.</p> : null}
          <a className="popover-footer" href={pr.url + '/checks'} target="_blank" rel="noopener">All checks on GitHub</a>
        </div>
      ) : null}
    </div>
  );
}

type AllCommentsState =
  | { status: 'loading' }
  | { status: 'ready'; comments: Comment[]; complete: boolean }
  | { status: 'error'; error: string };

// One request per PR version: a newer updatedAt means new activity, so the list is loaded again.
const allCommentsCache = new Map<string, Promise<AllComments>>();

function useAllComments(pr: DerivedPullRequest, open: boolean): AllCommentsState {
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

function CommentCell({ pr, now }: { pr: DerivedPullRequest; now: number }) {
  const { open, ref, toggle } = usePopover(COMMENTS_PANEL_PX);
  const all = useAllComments(pr, open);
  const latest = pr.latestComment;
  if (!pr.commentText || !latest) return <span className="dash">No comments</span>;
  const preview = pr.comments.length > 1 ? 'Last ' + pr.comments.length + ' comments' : 'Last comment';
  // The latest comments from prs.json show at once; the full list replaces them when it arrives.
  const shown = all.status === 'ready' && all.comments.length ? all.comments : pr.comments;
  const title = all.status === 'ready' && all.comments.length ? plural(all.comments.length, 'comment') : preview;
  return (
    <div className="comment-wrap" ref={ref}>
      <button type="button" className="comment-preview" aria-expanded={open} aria-label={'Comments on PR #' + pr.number} onClick={toggle}>
        <span className="comment-head">
          {latest.author ? <><Avatar actor={latest.author} small /><span>{displayLogin(latest.author)}</span></> : null}
          <span>· {formatAgo(latest.at, now)}</span>
          {pr.comments.length > 1 ? <span className="comment-more">+{pr.comments.length - 1}</span> : null}
        </span>
        <span className="comment-body">{markdownText(latest.body)}</span>
      </button>
      {open ? (
        <div className="popover comments-popover" role="dialog" aria-label={'Comments on PR #' + pr.number} style={COMMENTS_PANEL_STYLE}>
          <div className="panel-head">
            <strong className="popover-title">{title} · PR #{pr.number}</strong>
            <button type="button" className="btn icon-only" aria-label="Close" onClick={toggle}>×</button>
          </div>
          {all.status === 'loading' ? <p className="muted" role="status">Loading all comments…</p> : null}
          {all.status === 'error' ? <p className="muted" role="status">Showing the latest only. Cannot load the rest: {all.error}</p> : null}
          {shown.map((c, i) => (
            <article key={i} className="comment-full">
              <header>
                {c.author ? <><Avatar actor={c.author} small /><span className="who">{displayLogin(c.author)}</span></> : <span className="who">Unknown author</span>}
                <span className="when" title={new Date(c.at).toUTCString()}>{formatAgo(c.at, now)}</span>
                {c.url ? <a href={c.url} target="_blank" rel="noopener">Open on GitHub</a> : null}
              </header>
              {/* Sanitized by DOMPurify in renderMarkdown. */}
              <div className="comment-text markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(c.body) }} />
              {c.truncated ? <div className="comment-cut">The comment is longer; open it on GitHub to read the rest.</div> : null}
            </article>
          ))}
          {all.status === 'ready' && !all.complete ? <p className="muted">The list is longer than the board loads. Open the PR on GitHub for the rest.</p> : null}
          <a className="popover-footer" href={pr.url} target="_blank" rel="noopener">Open the conversation on GitHub</a>
        </div>
      ) : null}
    </div>
  );
}

function Tiles({ base, active, setQuick }: { base: DerivedPullRequest[]; active: string[]; setQuick: (quick: string[]) => void }) {
  return (
    <div className="tiles" role="group" aria-label="Quick filters">
      <button type="button" className="tile" aria-pressed={active.length === 0} onClick={() => setQuick([])}>
        <span className="count">{base.length}</span>
        <span className="label">Open PRs</span>
      </button>
      {QUICK.map((q) => {
        const count = base.filter(q.test).length;
        const pressed = active.includes(q.id);
        return (
          <button key={q.id} type="button"
            className={'tile tone-' + q.tone + (count === 0 ? ' zero' : '')}
            aria-pressed={pressed}
            title={pressed ? 'Click to remove this filter' : 'Click to show only these'}
            onClick={() => setQuick(pressed ? active.filter((id) => id !== q.id) : active.concat(q.id))}>
            <span className="count">{count}</span>
            <span className="label">{q.label}</span>
          </button>
        );
      })}
    </div>
  );
}

interface AuthorEntry {
  login: string;
  actor: Actor | null;
  bot: boolean;
  count: number;
}

function AuthorMenu({ authors, selected, mode, setAuthors }: {
  authors: AuthorEntry[];
  selected: Set<string>;
  mode: AuthorsFilter;
  setAuthors: (value: AuthorsFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, setOpen);

  let summary;
  if (mode === null) summary = 'People';
  else if (mode === 'all') summary = 'Everyone';
  else if (mode === 'bots') summary = 'Bots';
  else if (selected.size === 0) summary = 'Nobody';
  else if (selected.size === 1) summary = Array.from(selected)[0];
  else summary = selected.size + ' selected';

  const toggle = (login: string) => {
    const next = new Set(selected);
    if (next.has(login)) next.delete(login); else next.add(login);
    const people = authors.filter((a) => !a.bot).map((a) => a.login);
    const bots = authors.filter((a) => a.bot).map((a) => a.login);
    const everyone = authors.map((a) => a.login);
    const same = (list: string[]) => list.length === next.size && list.every((l) => next.has(l));
    if (same(people)) setAuthors(null);
    else if (same(everyone)) setAuthors('all');
    else if (bots.length && same(bots)) setAuthors('bots');
    else setAuthors(everyone.filter((l) => next.has(l)));
  };
  const group = (title: string, list: AuthorEntry[]) => list.length ? (
    <>
      <div className="group">{title}</div>
      {list.map((a) => (
        <label key={a.login}>
          <input type="checkbox" id={'author-' + a.login} checked={selected.has(a.login)} onChange={() => toggle(a.login)} />
          <Avatar actor={a.actor} small />
          <span>{a.actor ? displayLogin(a.actor) : 'ghost'}</span>
          <span className="n">{a.count}</span>
        </label>
      ))}
    </>
  ) : null;

  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
        Authors: <strong>{summary}</strong> <span className="arrow" aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open ? (
        <div className="menu" role="group" aria-label="Authors">
          <div className="actions">
            <button type="button" className="btn" onClick={() => setAuthors(null)}>People</button>
            <button type="button" className="btn" onClick={() => setAuthors('bots')}>Bots</button>
            <button type="button" className="btn" onClick={() => setAuthors('all')}>Everyone</button>
            <button type="button" className="btn" onClick={() => setAuthors([])}>Clear</button>
          </div>
          {group('People', authors.filter((a) => !a.bot))}
          {group('Bots', authors.filter((a) => a.bot))}
        </div>
      ) : null}
    </div>
  );
}

// Where the data comes from and how old it is, behind a small status dot: green for live data, gray for the snapshot.
function UpdateInfo({ report, live, now }: { report: Report; live: boolean; now: number }) {
  const { open, position, ref, toggle } = usePopover(UPDATE_POPOVER_PX);
  const summary = (live ? 'Live data' : 'Hourly snapshot') + ', ' + formatAgo(report.generatedAt, now);
  return (
    <div className="update-info" ref={ref}>
      <button type="button" className={'btn ghost source-button' + (live ? ' live' : '')} aria-label={summary}
        title={summary} aria-expanded={open} onClick={toggle}>
        <span className="source-dot" aria-hidden="true"></span>
        <span className="source-age">{live ? 'live, ' : 'updated '}{formatAgo(report.generatedAt, now)}</span>
      </button>
      {open ? (
        <div className="popover" role="dialog" aria-label="Data source" style={position}>
          <strong className="popover-title">{live ? 'Live data' : 'Hourly snapshot'}</strong>
          <p className="muted">
            {live ? 'Loaded from GitHub with your token ' : 'Published by the scheduled workflow '}
            {formatAgo(report.generatedAt, now)}, at {new Date(report.generatedAt).toLocaleString()}.
          </p>
          {live ? null : <p className="muted">Refresh loads live data from GitHub.</p>}
          {report.runUrl ? <a className="popover-footer" href={report.runUrl} target="_blank" rel="noopener">Workflow run</a> : null}
        </div>
      ) : null}
    </div>
  );
}

function CopyLink() {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setState('copied');
      setTimeout(() => setState('idle'), COPIED_FEEDBACK_MS);
    }, () => setState('failed'));
  };
  const label = state === 'copied' ? 'Link copied' : state === 'failed' ? 'Copy the address bar instead' : 'Copy link to this view';
  return <button type="button" className="btn ghost" onClick={copy}>{label}</button>;
}

function RefreshControl({ token, setToken, refreshing, onRefresh, settings, onSettingsChange, canResetWidths, onResetWidths }: {
  token: string;
  setToken: (value: string) => void;
  refreshing: boolean;
  onRefresh: (token: string) => void;
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
  canResetWidths: boolean;
  onResetWidths: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Refresh without a token opens the panel at the token field; the gear opens it at the top.
  const [askForToken, setAskForToken] = useState(false);
  const ref = useDismiss(open, setOpen);
  const custom = !rulesAreDefault(settings.rules);

  return (
    <div className="menu-wrap refresh" ref={ref}>
      <div className="refresh-buttons">
        <button type="button" className="btn primary" disabled={refreshing}
          onClick={() => { if (token) onRefresh(token); else { setAskForToken(true); setOpen(true); } }}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <button type="button" className="btn icon" aria-label={custom ? 'Settings (custom attention rules)' : 'Settings'}
          title={custom ? 'Settings. Your attention rules differ from the team defaults.' : 'Settings'}
          aria-expanded={open} onClick={() => { setAskForToken(false); setOpen(!open); }}>
          ⚙{custom ? <span className="dot" aria-hidden="true"></span> : null}
        </button>
      </div>
      {open ? (
        <SettingsPanel settings={settings} onChange={onSettingsChange} token={token} setToken={setToken} refreshing={refreshing} askForToken={askForToken}
          onRefresh={(value) => { setOpen(false); onRefresh(value); }} canResetWidths={canResetWidths} onResetWidths={onResetWidths} />
      ) : null}
    </div>
  );
}

function SettingsPanel({ settings, onChange, token, setToken, refreshing, askForToken, onRefresh, canResetWidths, onResetWidths }: {
  settings: Settings;
  onChange: (settings: Settings) => void;
  token: string;
  setToken: (value: string) => void;
  refreshing: boolean;
  askForToken: boolean;
  onRefresh: (token: string) => void;
  canResetWidths: boolean;
  onResetWidths: () => void;
}) {
  const { rules } = settings;
  const [staleDraft, setStaleDraft] = useState(String(rules.staleDays));
  const [botsDraft, setBotsDraft] = useState(rules.extraBots.join(', '));
  const [tokenDraft, setTokenDraft] = useState('');
  const joinAreas = (modules: Rules['areaModules']) => ({ be: modules.be.join(', '), fe: modules.fe.join(', ') });
  const [areaDrafts, setAreaDrafts] = useState(() => joinAreas(rules.areaModules));
  useEffect(() => setStaleDraft(String(rules.staleDays)), [rules.staleDays]);
  useEffect(() => setBotsDraft(rules.extraBots.join(', ')), [rules.extraBots]);
  useEffect(() => setAreaDrafts(joinAreas(rules.areaModules)), [rules.areaModules]);

  const setRules = (changes: Partial<Rules>) => onChange({ ...settings, rules: { ...rules, ...changes } });
  const changeStale = (text: string) => {
    setStaleDraft(text);
    const days = Number(text);
    if (isValidStaleDays(days)) setRules({ staleDays: days });
  };
  const commitBots = () => setRules({ extraBots: parseList(botsDraft) });
  const commitArea = (id: AreaId) => setRules({ areaModules: { ...rules.areaModules, [id]: parseList(areaDrafts[id]) } });
  const toggleColumn = (id: string) => onChange({
    ...settings,
    hiddenColumns: settings.hiddenColumns.includes(id) ? settings.hiddenColumns.filter((c) => c !== id) : settings.hiddenColumns.concat(id),
  });
  const saveToken = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = tokenDraft.trim();
    if (!value) return;
    setToken(value);
    setTokenDraft('');
    onRefresh(value);
  };

  return (
    <div className="menu settings-panel" role="dialog" aria-label="Settings">
      <section>
        <h2>Attention rules</h2>
        <label className="inline-field">
          Stale after
          <input type="number" min={MIN_STALE_DAYS} max={MAX_STALE_DAYS} step={1} value={staleDraft}
            onChange={(e) => changeStale(e.target.value)} onBlur={() => setStaleDraft(String(rules.staleDays))} />
          days
        </label>
        <label>
          <input type="checkbox" checked={rules.checkTitle} onChange={() => setRules({ checkTitle: !rules.checkTitle })} />
          Title follows Conventional Commits
        </label>
        <label>
          <input type="checkbox" checked={rules.requireIssue} onChange={() => setRules({ requireIssue: !rules.requireIssue })} />
          Linked issue or GitHub Project
        </label>
        <label className="stacked-field" htmlFor="extra-bots">Extra bot logins</label>
        <input id="extra-bots" className="text-field" value={botsDraft} placeholder="login, login" autoComplete="off"
          onChange={(e) => setBotsDraft(e.target.value)} onBlur={commitBots}
          onKeyDown={(e) => { if (e.key === 'Enter') commitBots(); }} />
      </section>
      <section>
        <h2>Areas</h2>
        <p className="hint">Label names, with or without <code>module:</code>, and title scopes such as <code>fix(ui)</code>. Tags like [BE] and [FE] and backend/ or frontend/ paths always count.</p>
        {AREAS.map((area) => (
          <div key={area.id} className="area-field">
            <label className="stacked-field" htmlFor={'area-' + area.id}>{area.label}</label>
            <textarea id={'area-' + area.id} className="text-field" rows={3} value={areaDrafts[area.id]}
              onChange={(e) => setAreaDrafts({ ...areaDrafts, [area.id]: e.target.value })} onBlur={() => commitArea(area.id)} />
          </div>
        ))}
      </section>
      <section>
        <h2>View</h2>
        <div className="setting-row">
          <span>Theme</span>
          <div className="segmented" role="group" aria-label="Theme">
            {THEMES.map(([value, label]) => (
              <button key={value} type="button" aria-pressed={settings.theme === value} onClick={() => onChange({ ...settings, theme: value })}>{label}</button>
            ))}
          </div>
        </div>
        <div className="setting-row">
          <span>Density</span>
          <div className="segmented" role="group" aria-label="Density">
            {DENSITIES.map(([value, label]) => (
              <button key={value} type="button" aria-pressed={settings.density === value} onClick={() => onChange({ ...settings, density: value })}>{label}</button>
            ))}
          </div>
        </div>
      </section>
      <section>
        <h2>Columns</h2>
        <div className="column-options">
          {COLUMNS.map((col) => (
            <label key={col.id} title={col.required ? 'This column is always shown' : undefined}>
              <input type="checkbox" checked={col.required || !settings.hiddenColumns.includes(col.id)} disabled={col.required}
                onChange={() => toggleColumn(col.id)} />
              {col.label}
            </label>
          ))}
        </div>
        <button type="button" className="btn" disabled={!canResetWidths} onClick={onResetWidths}>Reset column widths</button>
      </section>
      <section>
        <h2>GitHub token</h2>
        <form className="token-form" onSubmit={saveToken}>
          <p>Refresh queries GitHub directly with your personal token. It stays in this browser and is sent only to api.github.com.</p>
          <p><a href={TOKEN_HELP_URL} target="_blank" rel="noopener">Create a fine-grained token</a> with public repository read access. No extra permissions are needed.</p>
          <label htmlFor="token-input">Token</label>
          <input id="token-input" type="password" autoComplete="off" autoFocus={askForToken}
            placeholder={token ? 'Saved. Paste a new one to replace it' : 'github_pat_…'}
            value={tokenDraft} onChange={(e) => setTokenDraft(e.target.value)} />
          <div className="actions">
            <button type="submit" className="btn primary" disabled={!tokenDraft.trim() || refreshing}>Save and refresh</button>
            {token ? <button type="button" className="btn" onClick={() => setToken('')}>Forget token</button> : null}
          </div>
        </form>
      </section>
      <div className="settings-foot">
        <span className="muted">Saved in this browser only.</span>
        <button type="button" className="btn" onClick={() => onChange({ ...DEFAULT_SETTINGS })}>Reset to defaults</button>
      </div>
    </div>
  );
}

interface ResizeHandlers {
  onResize: (id: string, width: number) => void;
  onCommit: (id: string, width: number) => void;
  onReset: (id: string) => void;
}

function ColumnResizer({ col, width, onResize, onCommit, onReset }: { col: Column; width: number } & ResizeHandlers) {
  const onPointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const startX = event.clientX;
    handle.setPointerCapture(event.pointerId);
    let latest = width;
    const move = (e: globalThis.PointerEvent) => {
      latest = Math.max(MIN_COLUMN_PX, Math.round(width + e.clientX - startX));
      onResize(col.id, latest);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      onCommit(col.id, latest);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    const step = event.key === 'ArrowLeft' ? -RESIZE_STEP_PX : event.key === 'ArrowRight' ? RESIZE_STEP_PX : 0;
    if (!step) return;
    event.preventDefault();
    onCommit(col.id, Math.max(MIN_COLUMN_PX, width + step));
  };
  return (
    <span className="col-resizer" role="separator" aria-orientation="vertical" tabIndex={0}
      aria-label={'Resize the ' + col.label + ' column'} aria-valuenow={width} aria-valuemin={MIN_COLUMN_PX}
      title="Drag to resize. Double-click to reset."
      onPointerDown={onPointerDown} onKeyDown={onKeyDown} onClick={(e) => e.stopPropagation()}
      onDoubleClick={() => onReset(col.id)}></span>
  );
}

function HeaderCell({ col, index, view, onSort, width, resize }: {
  col: Column;
  index: number;
  view: View;
  onSort: (key: SortKey) => void;
  width: number;
  resize: ResizeHandlers;
}) {
  const resizer = <ColumnResizer col={col} width={width} {...resize} />;
  // Each cell sits above the next one, so its resize handle stays usable where it overlaps the neighbor.
  const style = { zIndex: HEADER_LAYER + COLUMNS.length - index };
  const sort = col.sort;
  if (!sort) {
    return <th className={col.cls} scope="col" title={col.hint || ''} style={style}><span>{col.label}</span>{resizer}</th>;
  }
  const active = view.sort === sort;
  const ariaSort = active ? (view.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th className={col.cls} scope="col" aria-sort={ariaSort} title={col.hint || ''} style={style}>
      <button type="button" onClick={() => onSort(sort)}>
        {col.label}
        <span className="arrow" aria-hidden="true">{active ? (view.dir === 'asc' ? '▲' : '▼') : ''}</span>
      </button>
      {resizer}
    </th>
  );
}

const SEARCH_EXAMPLES = ['label:bug -is:draft', 'reviewer:anna-dev review:none', 'area:fe ci:failing', 'label:"module:ui" is:stale', 'no:issue no:label'];

function SearchHelp({ onExample }: { onExample: (query: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, setOpen);
  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="btn icon-only" aria-label="Search syntax" aria-expanded={open} onClick={() => setOpen(!open)}>?</button>
      {open ? (
        <div className="menu search-help" role="dialog" aria-label="Search syntax">
          <strong>Search syntax</strong>
          <p>Words match the title, number, people, labels, branch, failed checks, issues, projects, comments, and attention reasons. Add qualifiers to narrow the list; a minus in front excludes.</p>
          <dl>
            {Object.entries(SEARCH_QUALIFIERS).map(([key, q]) => <div key={key}><dt><code>{key}:</code></dt><dd>{q.hint}</dd></div>)}
          </dl>
          <p>Examples:</p>
          <div className="examples">
            {SEARCH_EXAMPLES.map((q) => <button key={q} type="button" className="btn" onClick={() => { onExample(q); setOpen(false); }}><code>{q}</code></button>)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const Row = memo(function Row({ pr, now, columns, activeLabels, onToggleLabel }: {
  pr: DerivedPullRequest;
  now: number;
  columns: Column[];
  activeLabels: Set<string>;
  onToggleLabel: (name: string) => void;
}) {
  const cls = ['ci-' + pr.ci, pr.example ? 'example' : ''].join(' ').trim();
  const merge = MERGE[pr.mergeable];
  const link = (content: ReactNode) => <a href={pr.url} target="_blank" rel="noopener">{content}</a>;
  const cells: Record<string, ReactNode> = {
    number: <td key="number" className="c-num mono num">{link('#' + pr.number)}</td>,
    title: (
      <td key="title" className="c-title">
        <div className="pr-title">{link(pr.title)}</div>
        {(pr.draft || pr.base !== 'main' || pr.example || pr.labels.length) ? (
          <div className="sub">
            {pr.example ? <span className="chip example">example</span> : null}
            {pr.draft ? <span className="chip draft">Draft</span> : null}
            {pr.base !== 'main' ? <span className="chip branch" title="Target branch">→ {pr.base}</span> : null}
            <LabelList labels={pr.labels} activeLabels={activeLabels} onToggle={onToggleLabel} />
          </div>
        ) : null}
        <IssueLine pr={pr} />
        {pr.note ? <div className="note">{pr.note}</div> : null}
      </td>
    ),
    author: <td key="author" className="c-person"><Person actor={pr.author} /></td>,
    ci: <td key="ci" className="c-state"><CiCell pr={pr} /></td>,
    review: <td key="review" className="c-state"><ReviewCell pr={pr} now={now} /></td>,
    merge: <td key="merge" className="c-state"><Pill state={merge} /></td>,
    age: (
      <td key="age" className="c-age">
        <div className={'age' + (pr.stale ? ' over' : '')}>{formatAge(pr.ageDays)}</div>
        <div className="activity" title={'Last updated ' + new Date(pr.updatedAt).toUTCString()}>updated {formatAgo(pr.updatedAt, now)}</div>
      </td>
    ),
    assignee: (
      <td key="assignee" className="c-person">
        {pr.assignees.length ? pr.assignees.map((a) => <Person key={a.login} actor={a} />)
          : <span className="dash">Unassigned</span>}
      </td>
    ),
    comment: <td key="comment" className="c-comment"><CommentCell pr={pr} now={now} /></td>,
    attention: (
      <td key="attention" className="c-attn">
        {pr.attention.length ? <AttentionBadge reasons={pr.attention} number={pr.number} /> : null}
      </td>
    ),
  };
  return <tr className={cls}>{columns.map((col) => cells[col.id])}</tr>;
});

function RulesButton() {
  const { open, position, ref, toggle } = usePopover(RULES_POPOVER_PX);
  const rules = useContext(RulesContext);
  const custom = !rulesAreDefault(rules);
  return (
    <div className="legend-rules" ref={ref}>
      {custom ? <span className="chip custom" title="Your attention rules differ from the team defaults. Change them in Settings.">Custom rules</span> : null}
      <button type="button" className="legend-link" aria-expanded={open} onClick={toggle}>Rules</button>
      {open ? (
        <div className="popover rules-popover" role="dialog" aria-label="Board rules" style={position}>
          <strong className="popover-title">Attention</strong>
          <ul>
            {rules.checkTitle ? <li>The title does not follow Conventional Commits, <code>type(scope): subject</code> with type {TITLE_TYPES.join(', ')}.</li> : null}
            <li>The PR is open for more than {rules.staleDays} days.</li>
            {rules.requireIssue ? <li>The PR has no linked issue (the Development field) and is not added to a GitHub Project.</li> : null}
          </ul>
          {custom ? (
            <p className="muted">These are your rules from Settings. The team defaults are {DEFAULT_RULES.staleDays} days, with the title and issue checks on.</p>
          ) : null}
          <strong className="popover-title">How states are read</strong>
          <ul>
            <li>CI uses the overall check status of the last commit.</li>
            <li>Review shows Changes requested if any reviewer's latest decision asks for changes. A comment-only review does not cancel an approval.</li>
            <li>Conflicts shows Checking while GitHub is still computing mergeability.</li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function LegendBar() {
  return (
    <footer className="legend-bar" aria-label="Legend">
      {LEGEND.map(([name, states]) => (
        <span key={name} className="legend-group">
          <span className="legend-name">{name}</span>
          {Object.values(states).map((st) => (
            <span key={st.label} className="legend-item">
              <span className={'pill short ' + st.tone}>{st.short}</span>{st.label}
            </span>
          ))}
          {states === REVIEW ? <span className="legend-item"><span className="pending">◷</span>pending reviewers</span> : null}
        </span>
      ))}
      <span className="legend-group">
        <span className="legend-name">Row</span>
        <span className="legend-item"><span className="stripe ci-failing"></span>CI failed</span>
        <span className="legend-item"><span className="stripe ci-running"></span>running</span>
        <span className="legend-item"><span className="stripe ci-passing"></span>passed</span>
      </span>
      <RulesButton />
    </footer>
  );
}

interface ReportData {
  status: 'loading' | 'ready' | 'error';
  report: Report | null;
  source: 'scheduled' | 'live' | null;
  error: string | null;
}

function useReportData() {
  const [state, setState] = useState<ReportData>({ status: 'loading', report: null, source: null, error: null });
  useEffect(() => {
    fetch(DATA_URL, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(parseReport)
      .then((report) => setState({ status: 'ready', report, source: 'scheduled', error: null }))
      .catch((error: Error) => setState({ status: 'error', report: null, source: null, error: 'Cannot load ' + DATA_URL + ' (' + error.message + ').' }));
  }, []);
  return [state, setState] as const;
}

export function App() {
  const [data, setData] = useReportData();
  const [view, setView] = useState(readView);
  const [token, setTokenState] = useState(readToken);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const [settings, setSettingsState] = useState(loadSettings);
  const [savedWidths, setSavedWidths] = useState(readColumnWidths);
  const [dragWidths, setDragWidths] = useState<Widths | null>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  useEffect(() => {
    const wrap = tableWrapRef.current;
    if (!wrap) return undefined;
    const observer = new ResizeObserver(() => setAvailableWidth(wrap.clientWidth));
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => writeView(view), [view]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') delete root.dataset.theme; else root.dataset.theme = settings.theme;
    root.dataset.density = settings.density;
  }, [settings.theme, settings.density]);

  const setSettings = (next: Settings) => { saveSettings(next); setSettingsState(next); };
  const rules = settings.rules;
  const columns = useMemo(() => COLUMNS.filter((c) => c.required || !settings.hiddenColumns.includes(c.id)), [settings.hiddenColumns]);
  const patch = useCallback((changes: Partial<View>) => setView((prev) => ({ ...prev, ...changes })), []);
  const setToken = (value: string) => { storeToken(value); setTokenState(value); };

  const refresh = (withToken: string) => {
    setRefreshing(true);
    setRefreshError(null);
    // Skip the heavy parts of the query that only hidden columns would show.
    const parts = { checks: columns.some((c) => c.id === 'ci'), comments: columns.some((c) => c.id === 'comment') };
    const options = { token: withToken, repository: REPOSITORY, parts };
    fetchOpenPullRequests(DEV ? { ...options, endpoint: DEV.graphqlUrl } : options)
      .then((report) => {
        setData({ status: 'ready', report, source: 'live', error: null });
        setNow(Date.now());
      })
      .catch((error: Error) => setRefreshError(error.message))
      .finally(() => setRefreshing(false));
  };

  const prs = useMemo(() => {
    return (data.report ? data.report.prs : []).map((pr) => derive(pr, now, rules));
  }, [data.report, now, rules]);

  const authors = useMemo(() => {
    const byLogin = new Map<string, AuthorEntry>();
    for (const pr of prs) {
      const entry = byLogin.get(pr.authorKey) || { login: pr.authorKey, actor: pr.author, bot: pr.bot, count: 0 };
      entry.count += 1;
      byLogin.set(pr.authorKey, entry);
    }
    return Array.from(byLogin.values()).sort((a, b) => a.login.localeCompare(b.login, 'en', { sensitivity: 'base' }));
  }, [prs]);

  const selected = useMemo(() => {
    if (view.authors === 'all') return new Set(authors.map((a) => a.login));
    if (view.authors === 'bots') return new Set(authors.filter((a) => a.bot).map((a) => a.login));
    // A chosen login without open PRs in the current data is left out, so counts match what is shown.
    if (view.authors) return new Set(authors.map((a) => a.login).filter((login) => view.authors!.includes(login)));
    return new Set(authors.filter((a) => !a.bot).map((a) => a.login));
  }, [view.authors, authors]);

  const parsedQuery = useMemo(() => parseQuery(view.q), [view.q]);
  const activeLabels = useMemo(() => new Set(parsedQuery.filters
    .filter((f) => f.key === 'label' && !f.negate).map((f) => f.value)), [parsedQuery]);

  const base = useMemo(() => prs.filter((pr) => {
    if (!selected.has(pr.authorKey)) return false;
    if (view.draft === 'ready' && pr.draft) return false;
    if (view.draft === 'draft' && !pr.draft) return false;
    if (view.area === 'other' && pr.areas.length) return false;
    if (view.area !== 'all' && view.area !== 'other' && !pr.areas.includes(view.area)) return false;
    return matchesQuery(pr, parsedQuery);
  }), [prs, selected, view.draft, view.area, parsedQuery]);

  const onToggleLabel = useCallback((name: string) => {
    setView((prev) => ({ ...prev, q: toggleLabelFilter(prev.q, name) }));
  }, []);

  const resizingId = dragWidths ? Object.keys(dragWidths)[0] : null;
  const widths = fitToWidth({ ...DEFAULT_WIDTHS, ...savedWidths, ...dragWidths }, availableWidth, resizingId, columns);
  const tableWidth = columns.reduce((sum, c) => sum + widths[c.id], 0);
  const commitWidths = (next: Widths) => {
    setSavedWidths(next);
    setDragWidths(null);
    writeColumnWidths(next);
  };
  const resize: ResizeHandlers = {
    onResize: (id, w) => setDragWidths({ [id]: w }),
    onCommit: (id, w) => {
      const next = { ...savedWidths, [id]: w };
      // Keep what the other flexible column showed during the drag, so nothing jumps on release.
      if (FLEX_COLUMNS.includes(id)) {
        const fitted = fitToWidth({ ...DEFAULT_WIDTHS, ...next }, availableWidth, id, columns);
        for (const other of FLEX_COLUMNS) if (other !== id) next[other] = fitted[other];
      }
      commitWidths(next);
    },
    onReset: (id) => {
      const next = { ...savedWidths };
      delete next[id];
      commitWidths(next);
    },
  };

  const rows = useMemo(() => {
    const tests = QUICK.filter((q) => view.quick.includes(q.id));
    const key = SORTS[view.sort];
    const sign = view.dir === 'asc' ? 1 : -1;
    return base.filter((pr) => tests.every((q) => q.test(pr))).sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (ka < kb) return -sign;
      if (ka > kb) return sign;
      return b.number - a.number;
    });
  }, [base, view.quick, view.sort, view.dir]);

  const onSort = (key: SortKey) => {
    if (view.sort === key) patch({ dir: view.dir === 'asc' ? 'desc' : 'asc' });
    else patch({ sort: key, dir: key === 'title' || key === 'author' ? 'asc' : 'desc' });
  };
  const resetView = () => setView({ ...DEFAULT_VIEW });
  const isDefault = JSON.stringify(view) === JSON.stringify(DEFAULT_VIEW);
  const report = data.report;

  const api = useMemo(() => ({ token, restUrl: DEV ? DEV.restUrl : REST_URL }), [token]);

  return (
    <ApiContext.Provider value={api}><RulesContext.Provider value={rules}>
      <header className="masthead">
        <h1><span className="repo">{report ? report.repo : repositoryName(REPOSITORY)}</span>Open pull requests</h1>
        <div className="masthead-side">
          <Tiles base={base} active={view.quick} setQuick={(quick) => patch({ quick })} />
          {report ? <UpdateInfo report={report} live={data.source === 'live'} now={now} /> : null}
          <RefreshControl token={token} setToken={setToken} refreshing={refreshing} onRefresh={refresh}
            settings={settings} onSettingsChange={setSettings}
            canResetWidths={Object.keys(savedWidths).length > 0} onResetWidths={() => commitWidths({})} />
        </div>
      </header>

      {refreshError ? <div className="banner bad" role="alert">Refresh failed. {refreshError}</div> : null}
      {data.status === 'error' ? (
        <div className="banner bad" role="alert">
          {data.error} The scheduled workflow may not have published data yet. Use Refresh with a token to load live data.
        </div>
      ) : null}
      {report && report.warnings.length ? <div className="banner warn">{report.warnings.map((w) => <div key={w}>{w}</div>)}</div> : null}

      <div className="toolbar">
        <label className="sr-only" htmlFor="pr-search">Search pull requests</label>
        <div className="search-box">
          <input id="pr-search" className="search" type="search" placeholder="Search, or filter: label:bug reviewer:anna-dev -is:draft"
            value={view.q} onChange={(e) => patch({ q: e.target.value })} />
          <SearchHelp onExample={(q) => patch({ q })} />
        </div>
        <AuthorMenu authors={authors} selected={selected} mode={view.authors} setAuthors={(value) => patch({ authors: value })} />
        <div className="segmented" role="group" aria-label="Draft status">
          {DRAFT_OPTIONS.map(([value, label]) =>
            <button key={value} type="button" aria-pressed={view.draft === value} onClick={() => patch({ draft: value })}>{label}</button>)}
        </div>
        <div className="segmented" role="group" aria-label="Area" title="Area comes from module labels, [FE]/[BE] tags, and frontend/ or backend/ paths">
          {AREA_OPTIONS.map(([value, label]) =>
            <button key={value} type="button" aria-pressed={view.area === value} onClick={() => patch({ area: value })}>{label}</button>)}
        </div>
        {isDefault ? null : <button type="button" className="btn ghost" onClick={resetView}>Reset view</button>}
        <CopyLink />
        <span className="result-count">{rows.length === 1 ? '1 pull request' : rows.length + ' pull requests'}</span>
      </div>

      <div className="table-wrap" ref={tableWrapRef}>
        <table className="board" style={{ width: tableWidth + 'px' }}>
          <colgroup>{columns.map((col) => <col key={col.id} style={{ width: widths[col.id] + 'px' }} />)}</colgroup>
          <thead><tr>{columns.map((col, index) => <HeaderCell key={col.id} col={col} index={index} view={view} onSort={onSort} width={widths[col.id]} resize={resize} />)}</tr></thead>
          <tbody>
            {data.status === 'loading' ? <tr><td colSpan={columns.length}><div className="empty">Loading pull requests…</div></td></tr>
              : rows.length ? rows.map((pr) => <Row key={pr.number} pr={pr} now={now} columns={columns} activeLabels={activeLabels} onToggleLabel={onToggleLabel} />)
                : (
                  <tr><td colSpan={columns.length}><div className="empty">
                    <strong>No pull requests match this view</strong>
                    <span>Try clearing the search or selecting more authors.</span>
                    <button type="button" className="btn" onClick={resetView}>Reset view</button>
                  </div></td></tr>
                )}
          </tbody>
        </table>
      </div>

      <LegendBar />
    </RulesContext.Provider></ApiContext.Provider>
  );
}
