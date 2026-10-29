// Writes prs.json into the site that `vite build` produced.
// Usage: GITHUB_TOKEN=... PR_BOARD_REPO=owner/name[,owner/name...] node scripts/build-site.ts <out-dir>

import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fetchOpenPullRequests } from '../src/github/graphql.ts';
import { snapshotReport } from '../src/model/report.ts';
import { parseRepositories, REPO_VARIABLE } from '../src/repository.ts';

const outDir = path.resolve(process.argv[2] || '_site');
const token = process.env.GITHUB_TOKEN;

let repositories;
try {
  repositories = parseRepositories(process.env[REPO_VARIABLE]);
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
if (!token) {
  console.error('GITHUB_TOKEN is not set. The GraphQL API needs a token even for public repositories.');
  process.exit(1);
}
if (!existsSync(path.join(outDir, 'index.html'))) {
  console.error('No page in ' + outDir + '. Run vite build first.');
  process.exit(1);
}

const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
const runUrl = GITHUB_RUN_ID ? GITHUB_SERVER_URL + '/' + GITHUB_REPOSITORY + '/actions/runs/' + GITHUB_RUN_ID : null;

let report;
try {
  report = await fetchOpenPullRequests({ token, repositories, withViewer: false });
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}

writeFileSync(path.join(outDir, 'prs.json'), JSON.stringify(snapshotReport(report, runUrl)));

console.log('Wrote ' + report.prs.length + ' open PRs to ' + path.join(outDir, 'prs.json'));
for (const warning of report.warnings) console.warn('Warning: ' + warning);
