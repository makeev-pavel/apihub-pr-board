# Engineering

## Stack

- TypeScript, React 19, and Vite. `vite build` bundles the page into `_site/`; the workflow then writes `prs.json`
  next to it.
- Node.js 22.18 or later runs the tests, the build script, and the dev mocks straight from `.ts` files with type
  stripping. That code uses only erasable syntax and imports with `.ts` extensions.
- `marked` and DOMPurify render comment Markdown (**SEC-4**). `jsdom` gives the Markdown tests a DOM.
- GitHub Pages deploys through the official Pages actions.

## Commands

```sh
npm install
npm run dev               # Vite on :5173 with mock data and hot reload
npm run dev:live          # live GitHub data; needs GITHUB_TOKEN and PR_BOARD_REPO
npm test                  # unit tests (node --test)
npm run typecheck         # tsc for the browser code and the Node code
npm run test:e2e          # browser tests (Playwright) on the mock server, port 5174, pinned clock
npm run build             # vite build into _site/, then prs.json; needs GITHUB_TOKEN and PR_BOARD_REPO
```

*Planned:* `npm run test:coverage` (task 20), `npm run test:requirements` (task S2), `npm run test:screenshots`
and `npm run test:screenshots:update` (task 22).

## Project structure

Now:

```text
src/            the page: app.tsx (UI), settings.ts, markdown.ts, repository.ts, config.ts
src/model/      rules without UI: attention, bots, areas, search, derived fields, prs.json shape
src/board/      board logic without React: states, columns, the view and its URL, rows, authors, formatting, storage
src/github/     the GraphQL query, raw types, normalization, and the GraphQL and REST clients
dev/            Vite plugin with the mocks, scenarios, the DEV panel, and fixtures
scripts/        build-site.ts writes prs.json after vite build
test/           unit tests, one file per module
docs/           requirements and decisions
tasks/          the current plan and task list
```

*Planned (tasks 14–18):* `src/hooks/`,
`src/components/`, `src/styles/`, `dev/scenarios/`, and `e2e/` for browser and screenshot
tests. No source file over about 300 lines.

## Code style

- Code that Node runs uses only erasable TypeScript: no enums, namespaces, or parameter properties; `import type`
  for types; `.ts` extensions in relative imports.
- Named constants instead of magic numbers; colors only through the theme tokens (**QUAL-6**).
- UI text, comments, and docs are in American English, sentence case, without filler.
- Data from GitHub crosses into the page through one normalization step, so components never see raw GraphQL.

```ts
// Long bot reports are cut so prs.json stays small; the popover links to the full comment.
export const COMMENT_BODY_LIMIT = 4000;
```

## Testing strategy

- **Unit tests** (`node --test`, `test/`) cover every module without React: normalization, rules, search, settings,
  Markdown sanitizing, and the GitHub clients against the mock scenarios, so the mocks and the clients stay in sync.
- **Browser tests** (Playwright, Chromium, `e2e/`) drive the page on the mock dev server and cover every user flow.
  `e2e/helpers.ts` pins the clock, resets the scenarios, and collects page errors; tests run one at a time because
  the server keeps the chosen scenario. Test titles start with the requirement ids they cover. Each test was seen
  failing in a mutation pass before it was kept.
- **Screenshot tests** (Playwright, Windows baselines, run locally) cover the visual states in both themes and both
  densities. *Planned: tasks 21–22.*
- All test data is mock data: a seeded typical board and topic-sorted corner cases on fictional people, with a fixed
  clock. No real repository, person, or PR appears in tests or fixtures.
- Every test names the requirement ids it covers, and a check fails when a requirement has no test. *Planned:
  task S2.*
- Every new display rule gets a corner case in the matching topic file of `dev/fixtures/cases/`, with a `note` that
  the board shows under the title.

## Dev environment

- `npm run dev` serves the page with a Vite plugin (`dev/mock-plugin.ts`) that answers `/prs.json`, the GraphQL
  endpoint for Refresh, and the REST endpoints for the comments panel from mock scenarios, and injects the DEV
  panel. Vite restarts when files under `dev/` or `src/github/` change.
- The DEV panel switches scenarios:
  - `prs.json` on page load: typical board and corner cases, typical board only, corner cases only, no PRs,
    300 PRs, project data unavailable, a three-day-old snapshot, a slow load, a missing file, invalid JSON, and JSON
    without a PR list;
  - Refresh: success, several pages, forbidden projects, fewer PRs than `totalCount`, a slow response, 401, 502,
    repository not found, and a network failure.
- Corner cases are raw GraphQL nodes, so they go through the same normalization as real data.
- `PR_BOARD_MOCK_NOW` (an ISO time) pins the mock clock, so every scenario returns the same dates on every run.
  Browser and screenshot tests set it; without it the mocks follow the real clock.

## Boundaries

- **Always:** keep the spec in step with behavior; run unit tests, the type check, and the build before a commit;
  add a corner case for a new display rule; keep files small.
- **Ask first:** new dependencies; changes to the workflow, its permissions, or deployment; pushing to a remote;
  changing a requirement's meaning.
- **Never:** commit a token or real repository data; name the target organization or real people in the
  repository; disable or delete a failing test to get green; load scripts or styles from other hosts.

## Success criteria

- Every requirement has at least one test, and all tests pass on every commit.
- The published board loads `prs.json` and renders it with no console errors, in both themes.
- No source file is over about 300 lines, and each module has one concern.
