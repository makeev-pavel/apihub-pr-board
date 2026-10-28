// BE and FE areas: which labels, title scopes, tags, and paths put a PR in each.

import type { AreaId, PullRequest } from '../types.ts';

export interface Area {
  id: AreaId;
  label: string;
  modules: string[];
  tag: RegExp;
  path: RegExp;
}

// Module labels follow the monorepo layout: module:<dir> for each dir under frontend/ or backend/.
// ui-tests live under tests/ but cover the UI, so they count as frontend.
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

export const DEFAULT_AREA_MODULES: Record<AreaId, string[]> = { be: AREAS[0].modules, fe: AREAS[1].modules };

// The scope of a Conventional Commits title, such as api-doc-viewer in fix(api-doc-viewer): ...
const TITLE_SCOPE = /^\w+\(([^()]+)\)!?:/;

const MODULE_PREFIX = 'module:';

export function areasOf(pr: Pick<PullRequest, 'title' | 'labels' | 'issues'>, areaModules = DEFAULT_AREA_MODULES): AreaId[] {
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
