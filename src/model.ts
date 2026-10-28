// Report rules shared by the page and the tests.

import type { Actor, AreaId, DerivedPullRequest, PullRequest, Report } from './types.ts';

export const STALE_DAYS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

// Attention rules. These are the team defaults; each viewer can change them in Settings.
export interface Rules {
  staleDays: number;
  checkTitle: boolean;
  requireIssue: boolean;
  // Accounts that are bots in practice but are regular GitHub users.
  extraBots: string[];
  // Per area: label names (with or without the module: prefix) and title scopes that put a PR in that area.
  areaModules: Record<AreaId, string[]>;
}

// GitHub logins are case-insensitive.
export function isBot(actor: Actor | null, extraBots: string[] = DEFAULT_RULES.extraBots): boolean {
  if (!actor) return false;
  const login = actor.login.toLowerCase();
  return actor.bot || login.endsWith('[bot]') || extraBots.some((bot) => bot.toLowerCase() === login);
}

export function daysBetween(fromIso: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(fromIso)) / DAY_MS));
}

// Mirrors the defaults of amannn/action-semantic-pull-request, the usual PR title lint.
export const TITLE_TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'];
const TITLE_HEADER = /^(\w+)(?:\([^()\r\n]*\))?!?: \S/;

export function titleProblem(title: string): string | null {
  const match = TITLE_HEADER.exec(title);
  if (!match) {
    return 'Title does not follow Conventional Commits: expected "type(scope): subject"';
  }
  if (!TITLE_TYPES.includes(match[1])) {
    return 'Title type "' + match[1] + '" is not allowed. Use one of: ' + TITLE_TYPES.join(', ');
  }
  return null;
}

export function attentionReasons(pr: Pick<PullRequest, 'title' | 'issues' | 'projects'>, ageDays: number, rules: Rules = DEFAULT_RULES): string[] {
  const reasons: string[] = [];
  const problem = rules.checkTitle ? titleProblem(pr.title) : null;
  if (problem) reasons.push(problem);
  if (ageDays > rules.staleDays) {
    reasons.push('Open ' + ageDays + ' days, limit is ' + rules.staleDays);
  }
  if (rules.requireIssue && !pr.issues.length) {
    if (pr.projects === null) {
      reasons.push('No linked issue; project membership could not be checked');
    } else if (!pr.projects.length) {
      reasons.push('No linked issue and not in a GitHub Project');
    }
  }
  return reasons;
}

// Module labels follow the monorepo layout: module:<dir> for each dir under frontend/ or backend/.
// ui-tests live under tests/ but cover the UI, so they count as frontend.
export interface Area {
  id: AreaId;
  label: string;
  modules: string[];
  tag: RegExp;
  path: RegExp;
}

export const AREAS: Area[] = [
  {
    id: 'be',
    label: 'BE',
    modules: ['agent', 'agents-backend', 'api-linter-service', 'commons-go', 'java-task-consumer', 'libraries-backend',
      'portal-backend', 'test-service'],
    tag: /\[BE\]/i,
    path: /(^|\s)\/?backend\//,
  },
  {
    id: 'fe',
    label: 'FE',
    modules: ['api-diff', 'api-doc-viewer', 'api-processor', 'api-unifier', 'api-visitor', 'apispec-view',
      'build-task-consumer', 'class-view', 'compatibility-suites', 'ddlapi', 'graphapi', 'http-spec', 'json-crawl',
      'rest-playground', 'ui', 'ui-tests'],
    tag: /\[(FE|UI)\]/i,
    path: /(^|\s)\/?frontend\//,
  },
];

// The scope of a Conventional Commits title, such as api-doc-viewer in fix(api-doc-viewer): ...
const TITLE_SCOPE = /^\w+\(([^()]+)\)!?:/;

export const DEFAULT_RULES: Rules = {
  staleDays: STALE_DAYS,
  checkTitle: true,
  requireIssue: true,
  extraBots: [],
  areaModules: { be: AREAS[0].modules, fe: AREAS[1].modules },
};

const MODULE_PREFIX = 'module:';

export function areasOf(pr: Pick<PullRequest, 'title' | 'labels' | 'issues'>, areaModules = DEFAULT_RULES.areaModules): AreaId[] {
  // A module:ui label matches both "module:ui" and "ui" in the lists; a plain label matches only its own name.
  const names = (pr.labels || []).map((l) => l.name.toLowerCase())
    .flatMap((name) => (name.startsWith(MODULE_PREFIX) ? [name, name.slice(MODULE_PREFIX.length)] : [name]));
  const scope = TITLE_SCOPE.exec(pr.title);
  if (scope) names.push(...scope[1].toLowerCase().split(',').map((m) => m.trim()));
  const texts = [pr.title, ...pr.issues.map((i) => i.title)];
  return AREAS.filter((area) => {
    const modules = areaModules[area.id].map((m) => m.toLowerCase());
    return names.some((n) => modules.includes(n)) || texts.some((t) => area.tag.test(t) || area.path.test(t));
  }).map((area) => area.id);
}

export function stripHtmlComments(body: string | null | undefined): string {
  return (body || '').replace(/<!--[\s\S]*?-->/g, ' ').trim();
}

export function cleanCommentText(body: string | null | undefined): string {
  return stripHtmlComments(body).replace(/\s+/g, ' ').trim();
}

export function derive(pr: PullRequest, now: number, rules: Rules = DEFAULT_RULES): DerivedPullRequest {
  const ageDays = daysBetween(pr.createdAt, now);
  const comments = pr.comments || [];
  const latestComment = comments[0] || null;
  const commentText = latestComment ? cleanCommentText(latestComment.body) : '';
  const authorKey = pr.author ? pr.author.login : 'ghost';
  const labels = pr.labels || [];
  const reviewers = pr.reviewers || [];
  const requestedReviewers = pr.requestedReviewers || [];
  const attention = attentionReasons(pr, ageDays, rules);
  const areas = areasOf({ ...pr, labels }, rules.areaModules);
  return {
    ...pr,
    comments,
    latestComment,
    areas,
    labels,
    reviewers,
    requestedReviewers,
    authorKey,
    bot: isBot(pr.author, rules.extraBots),
    ageDays,
    stale: ageDays > rules.staleDays,
    attention,
    commentText,
    searchText: [
      '#' + pr.number,
      pr.title,
      authorKey,
      pr.base,
      pr.ci,
      pr.review.replace('_', ' '),
      pr.mergeable === 'conflicts' ? 'conflicts' : '',
      pr.draft ? 'draft' : '',
      areas.join(' '),
      pr.assignees.map((a) => a.login).join(' '),
      reviewers.map((r) => r.login).join(' '),
      requestedReviewers.map((r) => r.login).join(' '),
      labels.map((l) => l.name).join(' '),
      pr.checks ? pr.checks.failed.map((c) => c.name + ' ' + (c.workflow || '')).join(' ') : '',
      pr.issues.map((i) => (i.number ? '#' + i.number + ' ' : '') + i.title).join(' '),
      (pr.projects || []).join(' '),
      comments.map((c) => (c.author ? c.author.login : '') + ' ' + cleanCommentText(c.body)).join(' '),
      attention.join(' '),
    ].join(' ').toLowerCase(),
  };
}

// GitHub-style search: free words plus qualifiers such as label:bug, author:anna-dev, -is:draft, label:"good first issue".
const QUERY_TOKEN = /(-?)(?:([a-z]+):)?(?:"([^"]*)"?|(\S+))/gi;

const includes = (haystack: string, needle: string) => haystack.toLowerCase().includes(needle);
const anyIncludes = (list: string[], needle: string) => list.some((item) => includes(item, needle));

export interface SearchQualifier {
  hint: string;
  test: (pr: DerivedPullRequest, value: string) => boolean;
}

export const SEARCH_QUALIFIERS: Record<string, SearchQualifier> = {
  author: { hint: 'author:anna-dev', test: (pr, v) => includes(pr.authorKey, v) },
  assignee: {
    hint: 'assignee:boris-k',
    test: (pr, v) => (v === 'none' ? !pr.assignees.length : anyIncludes(pr.assignees.map((a) => a.login), v)),
  },
  reviewer: {
    hint: 'reviewer:chen-li (reviewed or requested)',
    test: (pr, v) => anyIncludes([...pr.reviewers, ...pr.requestedReviewers].map((r) => r.login), v),
  },
  label: {
    hint: 'label:bug, label:"module:ui"',
    test: (pr, v) => (v === 'none' ? !pr.labels.length : anyIncludes(pr.labels.map((l) => l.name), v)),
  },
  base: { hint: 'base:develop', test: (pr, v) => includes(pr.base, v) },
  area: { hint: 'area:be, area:fe, area:other', test: (pr, v) => (v === 'other' ? !pr.areas.length : pr.areas.includes(v as AreaId)) },
  ci: { hint: 'ci:failing, ci:running, ci:passing, ci:none', test: (pr, v) => pr.ci.startsWith(v) },
  review: { hint: 'review:approved, review:changes, review:none', test: (pr, v) => pr.review.startsWith(v) },
  is: {
    hint: 'is:draft, is:ready, is:bot, is:conflict, is:stale, is:attention',
    test: (pr, v) => ({
      draft: pr.draft,
      ready: !pr.draft,
      bot: pr.bot,
      conflict: pr.mergeable === 'conflicts',
      conflicts: pr.mergeable === 'conflicts',
      stale: pr.stale,
      attention: pr.attention.length > 0,
    } as Record<string, boolean>)[v] === true,
  },
  no: {
    hint: 'no:issue, no:label, no:assignee, no:review',
    test: (pr, v) => ({
      issue: !pr.issues.length,
      label: !pr.labels.length,
      assignee: !pr.assignees.length,
      review: !pr.reviewers.length,
    } as Record<string, boolean>)[v] === true,
  },
};

export interface QueryFilter {
  key: string;
  value: string;
  negate: boolean;
}

export interface QueryWord {
  value: string;
  negate: boolean;
}

export interface ParsedQuery {
  filters: QueryFilter[];
  words: QueryWord[];
}

export function parseQuery(query: string): ParsedQuery {
  const filters: QueryFilter[] = [];
  const words: QueryWord[] = [];
  for (const match of query.matchAll(QUERY_TOKEN)) {
    const [, minus, rawKey, quoted, bare] = match;
    const value = (quoted !== undefined ? quoted : bare || '').toLowerCase();
    const key = rawKey ? rawKey.toLowerCase() : null;
    const negate = minus === '-';
    if (key && SEARCH_QUALIFIERS[key]) {
      if (value) filters.push({ key, value, negate });
    } else if (!key && value.endsWith(':') && SEARCH_QUALIFIERS[value.slice(0, -1)]) {
      // A qualifier still being typed, such as "label:", filters nothing yet.
    } else {
      const word = ((key ? key + ':' : '') + value).trim();
      if (word) words.push({ value: word, negate });
    }
  }
  return { filters, words };
}

export function matchesQuery(pr: DerivedPullRequest, parsed: ParsedQuery): boolean {
  for (const word of parsed.words) {
    if (pr.searchText.includes(word.value) === word.negate) return false;
  }
  for (const filter of parsed.filters) {
    if (SEARCH_QUALIFIERS[filter.key].test(pr, filter.value) === filter.negate) return false;
  }
  return true;
}

// Adds label:<name> to the query, or removes every positive filter for that label (any case or quoting).
export function toggleLabelFilter(query: string, name: string): string {
  const target = name.toLowerCase();
  const kept: string[] = [];
  let removed = false;
  for (const match of query.matchAll(QUERY_TOKEN)) {
    const [token, minus, key, quoted, bare] = match;
    const value = (quoted !== undefined ? quoted : bare || '').toLowerCase();
    if (minus !== '-' && key && key.toLowerCase() === 'label' && value === target) removed = true;
    else kept.push(token);
  }
  if (removed) return kept.join(' ');
  const token = /[\s"]/.test(name) ? 'label:"' + name.replace(/"/g, '') + '"' : 'label:' + name;
  return (query.trim() + ' ' + token).trim();
}

// prs.json comes from the network: check the parts the page cannot render without.
export function parseReport(value: unknown): Report {
  const report = value as Partial<Report> | null;
  if (!report || typeof report !== 'object' || !Array.isArray(report.prs)) {
    throw new Error('the file has no list of pull requests');
  }
  return {
    repo: typeof report.repo === 'string' ? report.repo : '',
    generatedAt: typeof report.generatedAt === 'string' ? report.generatedAt : new Date(0).toISOString(),
    runUrl: typeof report.runUrl === 'string' ? report.runUrl : null,
    warnings: Array.isArray(report.warnings) ? report.warnings.filter((w) => typeof w === 'string') : [],
    prs: report.prs,
  };
}
