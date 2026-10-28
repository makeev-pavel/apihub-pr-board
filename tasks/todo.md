# Tasks: final refactor, mock-only data, and full test coverage

The plan, decisions, risks, and open questions are in `tasks/plan.md`. Commands used below: `npm test` (unit),
`npm run typecheck`, `npx vite build`, `npm run test:e2e` (browser, from Task 6), `npm run test:screenshots`
(from Task 22).

## Phase 0: Baseline and spec

### Task 0: Commit the current state as the refactoring baseline

**Description:** Record the working board before any restructuring, so every later step can be compared and undone.

**Acceptance criteria:**
- [x] One commit on a new branch holds the current tree; `tasks/` is included.

**Verification:**
- [ ] `git status` is clean; `npm test`, `npm run typecheck`, and `npx vite build` pass on that commit.

**Dependencies:** user approval (open question 1). **Files:** none changed. **Scope:** XS.

### Task S1: Restructure the requirements into a spec split by area, with requirement ids

**Description:** Replace `docs/requirements.md` with `docs/requirements/`: an index plus one file per area. Follow
the spec template (objective, scope and non-goals, product
requirements, tech stack, commands, project structure, code style, testing strategy, boundaries, success criteria,
known limitations). Give each product requirement a stable id. Apply every finding of the audit in
`tasks/plan.md`: remove the noise, fix the outdated parts, merge the duplicates, and add the missing requirements.

**Acceptance criteria:**
- [x] Every audit finding is resolved; every implemented behavior has a requirement, and every requirement is
  implemented or marked as planned.
- [x] Each product requirement has an id and is phrased so a test can check it.
- [x] `CLAUDE.md` points to the spec instead of repeating it.

**Verification:**
- [x] A side-by-side read of the spec against the running board with the corner-case scenario; line length 120.
- [x] The user approves the document (checkpoint "spec"; approved in the session on October 28, 2026).

**Dependencies:** Task 0. **Files:** `docs/requirements/*.md`, `docs/requirements.md` (removed), `CLAUDE.md`,
`README.md`. **Scope:** M.

### Checkpoint: spec
- [x] The user reviews and approves `docs/requirements/` before any code changes.

## Phase 1: Mock data only

### Task 1: Fixed mock clock for the dev server

**Description:** Let the mock server take "now" from `PR_BOARD_MOCK_NOW`, so every scenario returns the same JSON on
every run. Without the variable, behavior stays as today.

**Acceptance criteria:**
- [x] With `PR_BOARD_MOCK_NOW` set, repeated requests to `/prs.json` and the GraphQL and REST mocks return the
  same bodies.
- [x] Without it, ages still follow the real clock.

**Verification:**
- [x] Unit test for the clock helper; manual `curl` of `/prs.json` twice with the variable set.

**Dependencies:** checkpoint "spec". **Files:** `dev/mock-plugin.ts`, `dev/scenarios.ts`, `test/scenarios.test.ts`.
**Scope:** S.

### Task 2: Fictional people, local avatars, and fixture builders

**Description:** Add a cast of fictional users, bots, and teams, and serve their avatars as generated SVGs from the dev
server, so mocks never load images from GitHub. Move the node builders (`user`, `label`, `run`, `checks`, `rollup`,
`review`, `conn`) into a shared module.

**Acceptance criteria:**
- [x] `dev/fixtures/people.ts` defines every login the fixtures use; none is a real account of the project.
- [x] `/__dev/avatar/<login>.svg` returns a deterministic avatar; fixtures point at it.
- [x] `dev/fixtures/builders.ts` holds the builders; `corner-cases.ts` imports them.

**Verification:**
- [x] `npm test`, `npm run typecheck`; the board shows the new avatars with no requests to github.com.

**Dependencies:** none. **Files:** `dev/fixtures/people.ts`, `dev/fixtures/builders.ts`, `dev/mock-plugin.ts`,
`dev/fixtures/corner-cases.ts`. **Scope:** M.

### Task 3: Generated typical board replaces the real snapshot

**Description:** Replace `sample-nodes.json` with a seeded generator that produces about 35 ordinary PRs with
realistic mixes of CI, review, labels, areas, ages, and comments. Rename the scenario from "Real sample" to "Typical
board".

**Acceptance criteria:**
- [x] `dev/fixtures/sample-nodes.json` is deleted; the generator output is the same for the same seed and clock.
- [x] The typical board covers every CI, review, and conflict state and both areas.

**Verification:**
- [x] Unit test for determinism and state coverage; `npm test`; manual look at the DEV panel scenarios.

**Dependencies:** Tasks 1 and 2. **Files:** `dev/fixtures/typical.ts`, `dev/scenarios.ts`, `test/scenarios.test.ts`,
`dev/fixtures/sample-nodes.json` (deleted). **Scope:** M.

### Task 4: Corner cases split by topic, all on fictional data

**Description:** Break `corner-cases.ts` into topic files (titles, people, CI, review, comments, labels and areas,
dates and sizes) on the fictional cast. Every existing case survives with its `note`.

**Acceptance criteria:**
- [x] Each topic file is under about 120 lines; an index concatenates them in a stable order.
- [x] The number of corner cases is the same as before or higher; every case has a `note`.

**Verification:**
- [x] A unit test asserts the case count and that numbers are unique; `npm test`; manual look at the board.

**Dependencies:** Task 2. **Files:** `dev/fixtures/cases/*.ts`, `dev/fixtures/corner-cases.ts`. **Scope:** M.

### Task 5: Real names removed from source, tests, and docs

**Description:** Replace real logins in search hints, the search placeholder, search examples, unit tests, and docs
with the fictional cast. Keep product configuration (repository name, default extra bot).

**Acceptance criteria:**
- [x] A grep for the project's real logins finds nothing outside the default extra bot in `src/model.ts`.

**Verification:**
- [x] `npm test`, `npm run typecheck`; the grep from the acceptance criterion.

**Dependencies:** Task 2. **Files:** `src/app.tsx`, `src/model.ts`, `test/*.test.ts`, `docs/requirements.md`,
`README.md`. **Scope:** M.

### Task C1: Target repository from configuration, no default bots

**Description:** Read the target repository from `PR_BOARD_REPO` in the build script, the dev server, and the page
(through Vite `define`). Remove the organization from code, workflow, package metadata, and docs; the workflow
passes a repository variable. Make the default extra bot list empty.

**Acceptance criteria:**
- [x] A case-insensitive grep for the organization name finds nothing in the repository.
- [x] `npm run build` without `PR_BOARD_REPO` fails with a message that names the variable.
- [x] The dev server uses `acme/widgets` unless `PR_BOARD_REPO` is set.

**Verification:**
- [x] Unit tests for repository parsing; `npm run build` with and without the variable; the grep.

**Dependencies:** Task 5. **Files:** `src/github.ts`, `scripts/build-site.ts`, `vite.config.ts`, `src/model.ts`,
`.github/workflows/pages.yml`. **Scope:** M.

### Checkpoint: mock data
- [x] All unit tests pass, the build passes, every DEV panel scenario renders.
- [x] Review with the user.

## Phase 2: Browser test safety net

### Task 6: Playwright setup with the mock server

**Description:** Add `@playwright/test` with Chromium, a config that starts Vite on a separate port with the fixed
mock clock, a helper to pick scenarios through `/__dev/state`, and one smoke test.

**Acceptance criteria:**
- [x] `npm run test:e2e` starts the server, runs the smoke test, and stops the server.
- [x] Tests run with one worker; each test resets the scenarios and `localStorage`.

**Verification:**
- [ ] `npm run test:e2e` passes twice in a row.

**Dependencies:** Task 1. **Files:** `package.json`, `playwright.config.ts`, `e2e/helpers.ts`, `e2e/smoke.spec.ts`,
`tsconfig.node.json`. **Scope:** M.

### Task 7: Browser tests for data loading and Refresh scenarios

**Description:** One test per `prs.json` scenario (typical, corner, empty, many, projects unavailable, stale, slow,
missing, invalid JSON, wrong shape) and per Refresh scenario (success, pages, partial error, count mismatch, slow,
401, 502, not found, network).

**Acceptance criteria:**
- [x] Each scenario asserts the visible outcome: rows, banners, error text, status dot, and the Refresh state.

**Verification:**
- [ ] `npm run test:e2e`.

**Dependencies:** Task 6. **Files:** `e2e/loading.spec.ts`, `e2e/refresh.spec.ts`. **Scope:** S.

### Task 8: Browser tests for sorting, filters, search, and URL state

**Description:** Cover sorting by every sortable column in both directions, the tiles, the author menu (presets,
manual choice, refresh keeps it current), draft and area filters, search words and every qualifier, label chips,
issue numbers, Reset view, and reload from a copied URL.

**Acceptance criteria:**
- [x] Each control is checked by the rows it leaves and by the URL it writes.

**Verification:**
- [ ] `npm run test:e2e`.

**Dependencies:** Task 6. **Files:** `e2e/sorting.spec.ts`, `e2e/filters.spec.ts`, `e2e/search.spec.ts`. **Scope:** M.

### Task 9: Browser tests for popovers and the comments panel

**Description:** Cover the CI, review, attention, rules, and data source popovers, including how they close (outside
click, Escape, page scroll), and the comments panel: the latest two at once, the full list from REST, the error and
rate-limit messages, and Markdown sanitizing.

**Acceptance criteria:**
- [x] Each popover's content matches its corner case; no script from a comment runs.

**Verification:**
- [ ] `npm run test:e2e`.

**Dependencies:** Task 6. **Files:** `e2e/popovers.spec.ts`, `e2e/comments.spec.ts`. **Scope:** S.

### Task 10: Browser tests for columns and settings

**Description:** Cover column resize by drag and keyboard, reset by double-click, widths after reload, the table
filling the window with hidden columns, and every setting: rules, areas, bots, theme, density, columns, token, Reset
to defaults, and the custom-rules indicators.

**Acceptance criteria:**
- [x] Each setting changes the board as the spec says and survives a reload; invalid stored values fall back.

**Verification:**
- [ ] `npm run test:e2e`.

**Dependencies:** Task 6. **Files:** `e2e/columns.spec.ts`, `e2e/settings.spec.ts`. **Scope:** S.

### Checkpoint: safety net
- [x] The full browser suite passes on the unrefactored code, twice in a row.
- [ ] Review with the user.

## Phase 3: Split the large files

Each task keeps behavior identical: `npm test`, `npm run typecheck`, `npm run test:e2e`, and `npx vite build` pass
after it, and no test changes except import paths.

### Task 11: Split `src/github.ts`

**Description:** Move the query, raw GraphQL types, normalization, the GraphQL client, and the REST comments client
into `src/github/` modules.

**Acceptance criteria:**
- [x] Each module is under about 200 lines; no module imports a Node API.

**Verification:** all suites and the build. **Dependencies:** checkpoint "safety net".
**Files:** `src/github/{query,raw,normalize,graphql,rest}.ts`, importers. **Scope:** M.

### Task 12: Split `src/model.ts`

**Description:** Move attention rules and bots, areas, search, derive, and `parseReport` into `src/model/` modules.

**Acceptance criteria:**
- [x] Each module has one concern and its own unit test file.

**Verification:** all suites and the build. **Dependencies:** Task 11.
**Files:** `src/model/{rules,areas,search,derive,report}.ts`, `test/model/*.test.ts`. **Scope:** M.

### Task 13: Extract pure board logic from `src/app.tsx`

**Description:** Move state tables (CI, review, merge), columns and `fitToWidth`, view and URL state, sorting, quick
filters, author list and selection, check grouping, label text color, formatting, and storage into `src/board/`.

**Acceptance criteria:**
- [x] `src/board/` has no React import; `app.tsx` shrinks by the moved code.

**Verification:** all suites and the build. **Dependencies:** Task 12.
**Files:** `src/board/{states,columns,view,authors,checks,format,storage}.ts`, `src/app.tsx`. **Scope:** M.

### Task 14: Extract hooks

**Description:** Move `useDismiss`, `usePopover`, `useReportData`, `useAllComments`, column widths, and settings state
into `src/hooks/`.

**Acceptance criteria:**
- [x] Each hook is its own file; `App` only composes them.

**Verification:** all suites and the build. **Dependencies:** Task 13.
**Files:** `src/hooks/*.ts`, `src/app.tsx`. **Scope:** S.

### Task 15: Split table cell components

**Description:** Move Avatar, Person, Pill, labels, issue line, and the CI, review, comment (with the comments panel),
and attention cells into `src/components/`.

**Acceptance criteria:**
- [ ] One component (or one tight pair) per file; shared contexts live in one module.

**Verification:** all suites and the build. **Dependencies:** Task 14.
**Files:** `src/components/{common,cells}/*.tsx`, `src/context.ts`. **Scope:** M.

### Task 16: Split header, toolbar, settings, and table components

**Description:** Move tiles, data source, Refresh, the settings panel (one file per section), author menu, search help,
copy link, table, header cell, resizer, row, legend, and rules into `src/components/`.

**Acceptance criteria:**
- [ ] `src/app.tsx` becomes `src/App.tsx` under about 200 lines; no file in `src/` over about 300.

**Verification:** all suites and the build. **Dependencies:** Task 15.
**Files:** `src/components/{header,toolbar,settings,table,legend}/*.tsx`, `src/App.tsx`, `src/main.tsx`. **Scope:** M.

### Task 17: Split `src/styles.css`

**Description:** Split into tokens, base layout, header, toolbar, table, popovers, settings, and Markdown files,
imported in order from `main.tsx`.

**Acceptance criteria:**
- [ ] Theme tokens stay in one file with both dark blocks; no rule changes.

**Verification:** all suites, the build, and a visual comparison before and after. **Dependencies:** Task 16.
**Files:** `src/styles/*.css`, `src/main.tsx`. **Scope:** S.

### Task 18: Split the dev mock plugin and scenarios

**Description:** Separate report scenarios, Refresh scenarios, the REST mock, avatars, and the plugin wiring.

**Acceptance criteria:**
- [ ] Each file is under about 150 lines; the DEV panel lists the same scenarios.

**Verification:** all suites and the build. **Dependencies:** Task 4.
**Files:** `dev/mock-plugin.ts`, `dev/scenarios/*.ts`. **Scope:** S.

### Checkpoint: structure
- [ ] No source file over about 300 lines; all suites and the build pass.
- [ ] Code-simplification pass over the new modules; review with the user.

## Phase 4: Unit coverage

### Task 19: Unit tests for the extracted modules

**Description:** Unit tests for everything in `src/board/`, the remaining branches of `src/github/` and `src/model/`,
and the settings and Markdown modules.

**Acceptance criteria:**
- [ ] Every exported function has a test of its normal case and its edge cases (empty, null, boundary values).

**Verification:** `npm test`. **Dependencies:** checkpoint "structure".
**Files:** `test/board/*.test.ts` and gaps elsewhere. **Scope:** M.

### Task 20: Coverage gate

**Description:** Run unit tests with Node's built-in coverage and fail below the agreed threshold for `src/**/*.ts`.

**Acceptance criteria:**
- [ ] `npm run test:coverage` reports per file and fails under 90% of lines.

**Verification:** `npm run test:coverage`. **Dependencies:** Task 19. **Files:** `package.json`. **Scope:** XS.

### Task S2: Requirement coverage check

**Description:** A script lists the requirement ids in `docs/requirements.md` and the ids named in unit and browser
tests, and fails when a requirement has no test or a test names an unknown id.

**Acceptance criteria:**
- [ ] `npm run test:requirements` passes only when every requirement id is covered.

**Verification:** `npm run test:requirements`; remove one test's id and see it fail.
**Dependencies:** Tasks S1, 10, and 19. **Files:** `scripts/check-requirements.ts`, `package.json`. **Scope:** S.

## Phase 5: Screenshot tests

### Task 21: Deterministic rendering

**Description:** Self-host the fonts from `@fontsource`, use local avatars, fix the browser clock in tests, and turn
off animations, so the same state renders the same pixels.

**Acceptance criteria:**
- [ ] The test page makes no request outside localhost.

**Verification:** a browser test that fails on any external request. **Dependencies:** Tasks 2 and 6.
**Files:** `package.json`, `index.html`, `src/styles/tokens.css`, `e2e/helpers.ts`. **Scope:** S.

### Task 22: Screenshot suite

**Description:** Screenshots of the board in light and dark themes and both densities, each popover and the comments
panel, the settings panel, empty and error states, a narrow window, and hidden columns.

**Acceptance criteria:**
- [ ] `npm run test:screenshots` compares against committed Windows baselines;
  `npm run test:screenshots:update` refreshes them.

**Verification:** the suite passes twice in a row on Windows. **Dependencies:** Task 21.
**Files:** `e2e/screenshots.spec.ts`, baseline images, `package.json`. **Scope:** S.

### Checkpoint: tests
- [ ] Coverage gate passes; browser and screenshot suites pass twice in a row.

## Phase 6: CI, docs, review

### Task 23: CI runs browser and screenshot tests

**Description:** Add a Playwright job (cached browsers, Linux) before the deploy that runs the browser tests without
the screenshot project, with the HTML report as an artifact when it fails, and the coverage gate in the unit job.

**Acceptance criteria:**
- [ ] A failing unit or browser test blocks the deploy; screenshots stay local.

**Verification:** a workflow run on a branch. **Dependencies:** Tasks 20 and 10.
**Files:** `.github/workflows/pages.yml`. **Scope:** S.

### Task 24: Docs and conventions

**Description:** Update the layout, commands, and conventions in `CLAUDE.md`, the development and testing sections of
`README.md` and `docs/requirements.md`, and record the test-stack decision as an ADR.

**Acceptance criteria:**
- [ ] Every file and command named in the docs exists; the conventions say where new fixtures, tests, and
  screenshots go.

**Verification:** a grep of every path named in the docs. **Dependencies:** Task 23.
**Files:** `CLAUDE.md`, `README.md`, `docs/requirements.md`, `docs/adr/0001-test-stack.md`. **Scope:** S.

### Task 25: Final review with a fresh reviewer

**Description:** Five-axis review of the whole codebase by a separate agent, then fix the confirmed findings.

**Acceptance criteria:**
- [ ] No open Critical or Required findings.

**Verification:** all suites and the build after the fixes. **Dependencies:** Task 24.
**Files:** as the findings require. **Scope:** S to M.

### Task P: Squash the local history before the first push

**Description:** The baseline commit holds real PR data and the organization name. Before anything is pushed,
rewrite the local branch into commits that contain neither, then push only after the user confirms.

**Acceptance criteria:**
- [x] `git log -p` on the branch to be pushed has no organization name and no real login (squashed early, on
  October 28, 2026, at the user's request).

**Verification:** the grep over `git log -p`; the user confirms the push. **Dependencies:** Task 25.
**Files:** git history only. **Scope:** XS.

### Checkpoint: complete
- [ ] Definition of done: tests pass, no regressions, behavior checked in the browser, docs updated.
- [ ] Review with the user.
