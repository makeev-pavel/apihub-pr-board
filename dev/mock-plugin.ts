// Vite plugin for the dev server: mocked /prs.json and GraphQL scenarios, or live GitHub data in --mode live.
// It also injects the DEV panel. None of this runs in `vite build`.

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { fetchOpenPullRequests } from '../src/github/graphql.ts';
import type { Repository } from '../src/repository.ts';
import type { DevConfig } from '../src/types.ts';
import { AVATAR_PATH, avatarSvg } from './avatars.ts';
import { mockClock } from './clock.ts';
import { REFRESH_SCENARIOS, REPORT_SCENARIOS, restComments } from './scenarios.ts';
import type { GraphqlVariables, MockResponse } from './scenarios.ts';

export const LIVE_MODE = 'live';
const LIVE_CACHE_MS = 5 * 60 * 1000;
const JSON_TYPE = 'application/json; charset=utf-8';
const TEXT_TYPE = 'text/plain; charset=utf-8';
const REST_PREFIX = '/__dev/rest';
// /repos/<owner>/<repo>/issues/<n>/comments or /repos/<owner>/<repo>/pulls/<n>/reviews
const REST_ROUTE = /^\/repos\/[^/]+\/[^/]+\/(issues|pulls)\/(\d+)\/(comments|reviews)$/;

function send(res: ServerResponse, status: number, body: string, type = TEXT_TYPE) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function respondMock(res: ServerResponse, result: MockResponse) {
  if (result.delayMs) await delay(result.delayMs);
  if (result.destroy) {
    res.socket?.destroy();
    return;
  }
  send(res, result.status, result.body, result.status === 200 ? JSON_TYPE : TEXT_TYPE);
}

export function devMocks({ repository }: { repository: Repository }): Plugin {
  const state = { report: REPORT_SCENARIOS[0].id, refresh: REFRESH_SCENARIOS[0].id };
  // Mock answers use this clock; the live cache below keeps real time.
  const now = mockClock();
  const token = process.env.GITHUB_TOKEN || '';
  let live = false;
  let liveCache: { at: number; body: string } | null = null;

  async function serveReport(res: ServerResponse) {
    if (!live) {
      const scenario = REPORT_SCENARIOS.find((s) => s.id === state.report) || REPORT_SCENARIOS[0];
      await respondMock(res, scenario.respond(now()));
      return;
    }
    if (!liveCache || Date.now() - liveCache.at > LIVE_CACHE_MS) {
      const report = await fetchOpenPullRequests({ token, repository });
      liveCache = { at: Date.now(), body: JSON.stringify({ ...report, runUrl: null }) };
      console.log('Fetched ' + report.prs.length + ' open PRs from GitHub');
    }
    send(res, 200, liveCache.body, JSON_TYPE);
  }

  async function serveGraphql(req: IncomingMessage, res: ServerResponse) {
    const request: { variables: GraphqlVariables } = JSON.parse(await readBody(req));
    const scenario = REFRESH_SCENARIOS.find((s) => s.id === state.refresh) || REFRESH_SCENARIOS[0];
    await respondMock(res, scenario.respond(request.variables, now()));
  }

  function serveRest(res: ServerResponse, pathname: string) {
    const match = REST_ROUTE.exec(pathname.slice(REST_PREFIX.length));
    const found = match ? restComments(Number(match[2]), now()) : null;
    if (!match || !found) return send(res, 404, JSON.stringify({ message: 'Not Found' }), JSON_TYPE);
    return send(res, 200, JSON.stringify(match[3] === 'comments' ? found.comments : found.reviews), JSON_TYPE);
  }

  // Generated avatars for the fictional cast; anything under missing/ is a broken image on purpose.
  function serveAvatar(res: ServerResponse, pathname: string) {
    const file = decodeURIComponent(pathname.slice(AVATAR_PATH.length));
    if (file.startsWith('missing/') || !file.endsWith('.svg')) return send(res, 404, 'Not found');
    return send(res, 200, avatarSvg(file.slice(0, -'.svg'.length)), 'image/svg+xml');
  }

  function devState() {
    return JSON.stringify({
      live,
      report: state.report,
      refresh: state.refresh,
      reportScenarios: REPORT_SCENARIOS.map(({ id, label }) => ({ id, label })),
      refreshScenarios: REFRESH_SCENARIOS.map(({ id, label }) => ({ id, label })),
    });
  }

  async function route(req: IncomingMessage, res: ServerResponse, next: () => void) {
    const { pathname } = new URL(req.url || '/', 'http://localhost');
    if (pathname === '/prs.json') return serveReport(res);
    if (pathname === '/__dev/graphql' && req.method === 'POST') return serveGraphql(req, res);
    if (pathname.startsWith(REST_PREFIX + '/') && req.method === 'GET') return serveRest(res, pathname);
    if (pathname.startsWith(AVATAR_PATH)) return serveAvatar(res, pathname);
    if (pathname === '/__dev/state' && req.method === 'GET') return send(res, 200, devState(), JSON_TYPE);
    if (pathname === '/__dev/state' && req.method === 'POST') {
      const update: { report?: string; refresh?: string } = JSON.parse(await readBody(req));
      if (REPORT_SCENARIOS.some((s) => s.id === update.report)) state.report = update.report!;
      if (REFRESH_SCENARIOS.some((s) => s.id === update.refresh)) state.refresh = update.refresh!;
      console.log('Scenario: report=' + state.report + ', refresh=' + state.refresh);
      return send(res, 200, devState(), JSON_TYPE);
    }
    return next();
  }

  return {
    name: 'apihub-pr-board-dev-mocks',
    apply: 'serve',
    configResolved(config) {
      live = config.mode === LIVE_MODE;
      if (live && !token) {
        throw new Error('Live mode needs GITHUB_TOKEN. For example: GITHUB_TOKEN=$(gh auth token) npm run dev:live');
      }
      console.log(live ? 'Data: live GitHub API' : 'Data: mock scenarios (switch them in the DEV panel)');
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        route(req, res, next).catch((error: Error) => {
          console.error(error);
          if (!res.headersSent) send(res, 500, 'Dev server error: ' + error.message);
        });
      });
    },
    transformIndexHtml() {
      const config: DevConfig = { graphqlUrl: '/__dev/graphql', restUrl: REST_PREFIX };
      return [
        // In live mode Refresh and the comments panel go to api.github.com, so the page gets no config.
        ...(live ? [] : [{ tag: 'script', children: 'window.PR_BOARD_DEV = ' + JSON.stringify(config) + ';', injectTo: 'head' as const }]),
        { tag: 'script', attrs: { type: 'module', src: '/dev/panel.ts' }, injectTo: 'body' as const },
      ];
    },
  };
}
