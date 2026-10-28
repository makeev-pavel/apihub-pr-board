// Corner cases. Labels and areas: colors, long lists, tags, and Dependabot paths.

import { bot, conn, ISSUES_URL, label, user } from '../builders.ts';
import type { FixtureEntry } from '../corner-cases.ts';
import { caseKit } from './kit.ts';

const FIRST_NUMBER = 9600;

export function labelCases(now: number): FixtureEntry[] {
  const { node, ago } = caseKit(now, FIRST_NUMBER);
  return [
    node('Labels: white, black, an invalid color, a label with spaces, an emoji, and a very long name.', {
      title: 'chore: label rendering check',
      author: user('hana-docs'), createdAt: ago(1), updatedAt: ago(1),
      labels: conn([
        label('wontfix', 'ffffff', 'This will not be worked on'),
        label('github-actions', '000000'),
        label('legacy', 'not-a-color'),
        label('good first issue', '7057ff', 'Good for newcomers'),
        label('profane content 🤬', 'fbca04'),
        label('module:jest-chrome-in-docker-environment', '1d76db'),
      ]),
    }),
    node('Ten labels: four are shown, the rest fold into +6.', {
      title: 'refactor: move shared OpenAPI helpers into commons',
      author: user('dara-ops'), createdAt: ago(3), updatedAt: ago(2),
      labels: conn(['ui', 'api-diff', 'api-doc-viewer', 'api-processor', 'api-unifier', 'portal-backend', 'agent',
        'commons-go', 'graphapi', 'http-spec'].map((m) => label('module:' + m, '1d76db'))),
    }),
    node('Area from tags: [BE] in the title and [FE] in the linked issue make this both BE and FE.', {
      title: 'fix: [BE] return 404 for a missing package version',
      author: user('anna-dev'), createdAt: ago(2), updatedAt: ago(1),
      closingIssuesReferences: conn([{ title: '[FE] Show a not-found page for a deleted version', url: ISSUES_URL }]),
    }),
    node('Area from a Dependabot path: /frontend/ counts as FE.', {
      title: 'chore: deps: bump @types/react in /frontend/api-doc-viewer',
      author: bot('dependabot'),
      assignees: conn([]), closingIssuesReferences: conn([]), createdAt: ago(1), updatedAt: ago(1),
      labels: conn([label('dependencies', '0366d6'), label('npm', 'cb3837')]),
    }),
  ];
}
