# Implementation plan: final refactor, mock-only data, and full test coverage

## Overview

Bring the requirements into a complete, testable spec split by area, then split the large source files into small
focused modules without changing behavior. Replace every piece of real data, and every mention of the organization
that owns the target repository, with configuration and fictional mocks. Cover the code with three layers of tests:
unit tests for pure logic, browser tests for every user flow, and screenshot tests for the visual states. This plan
changes structure, configuration, and tests, not features.

Starting point, by line count: `src/app.tsx` 1367, `src/github.ts` 485, `src/styles.css` 396,
`dev/fixtures/corner-cases.ts` 361, `src/model.ts` 301. Real data lives in `dev/fixtures/sample-nodes.json`
(34 real PRs) and in real logins across fixtures, tests, search hints, and the search placeholder.

## Architecture decisions

- **Browser tests run in Playwright against the mock dev server.** Node runs `.ts` but not `.tsx`, so component
  tests in Node would need a second toolchain (Vitest or a JSX transform). Playwright drives the real page with the
  existing mock scenarios, and the recent bugs (resize handle, sorting, table width) were exactly the kind that only
  a real browser catches. `node --test` stays for pure logic.
- **Logic moves out of components first.** Everything that does not need React (columns, view and URL state,
  sorting, quick filters, author selection, formatting, storage) becomes plain `.ts` modules with unit tests.
  Components keep only rendering and wiring.
- **Mocks are deterministic.** A fixed mock clock (server and page), a seeded generator for the typical board, local
  SVG avatars, and self-hosted fonts make the same scenario render the same pixels on every run.
- **Nothing in git names the organization or its people.** The target repository comes from `PR_BOARD_REPO`
  (`owner/name`): a repository variable in CI, an environment variable locally. The build fails without it, and
  the page takes it from the build. The default list of extra bots is empty; teams add their service accounts in
  Settings. Mocks, tests, and docs use a fictional `acme/widgets` repository and fictional people.
- **Fonts are self-hosted** from the `@fontsource` IBM Plex packages instead of Google Fonts: stable screenshots,
  no external host, and nothing to allow in a future Content-Security-Policy.
- **Screenshot baselines are Windows only** and run locally (`npm run test:screenshots`). CI runs unit and browser
  tests, not screenshots. If Linux baselines are ever needed, the Playwright image runs under Podman.
- **Requirements are split by area** into `docs/requirements/`, with an index that links the files and lists the
  id prefixes.
- **Characterization tests come before the split.** The browser suite is written against the current UI, so each
  refactoring step is checked by the same tests before and after.
- **Target size:** no source file over about 300 lines, `App.tsx` under about 200.
- **Requirements get stable ids** (`DATA-3`, `TABLE-5`, and so on), unique across the files. Every browser and
  unit test names the ids it covers, and a script fails when an id has no test. This turns "cover everything with
  tests" into a check.

## Requirements audit

`docs/requirements.md` was read in full on October 28, 2026. Findings, grouped by kind:

**Noise to remove**
- "No easter eggs. The snake game from the old report is dropped." describes the old report, not this one.
- The reasoning about OAuth and the anonymous REST limit (lines 29–31) is a design rationale, not a requirement; it
  belongs in the technical decisions.

**Outdated or contradictory**
- Attention rule 2 says "more than 10 days", and the age column says "red over the limit", but the limit and two of
  the three rules are now settings.
- "Collected fields" says the two latest comments are fetched; the query now fetches up to five comments and ten
  reviews and keeps two, and Refresh may skip check details and comment bodies for hidden columns.
- The popover rules (open upward or leftward, close on scroll) do not apply to the comments panel, which docks to
  the right edge; the data source and Rules popovers are not listed at all.
- The development section still describes the real PR snapshot, which this plan removes.
- Search examples use real logins of the project's developers.

**Duplicates**
- "The table always fills the window" appears in both the layout and the Settings sections.
- Where column widths are stored appears in both sections too.

**Not requirements**
- Two open questions are known limitations (team review requests need org access) or maintenance notes
  (`SUMMARY_CHECKS`, `TITLE_TYPES`, area defaults). They belong in a "Known limitations and maintenance" section.

**Missing (implemented or agreed, but not written down)**
- Loading, empty, and error states of the table, and their texts.
- Security and privacy in one place: token handling, Markdown sanitizing, no external requests from comments
  beyond images, workflow permissions, and the token visible only to the fetch step.
- Accessibility: accessible names, keyboard resize, Escape, focus behavior.
- Supported browsers and the size the board must handle (the 300-PR scenario).
- The data source dot in the legend, and the pending-reviewer counter in the legend.
- The spec template's own sections: testing strategy, project structure, code style, boundaries (always, ask
  first, never; for example, new dependencies are pinned and at least two weeks old), and success criteria.

## Task list

Full tasks with acceptance criteria and verification are in `tasks/todo.md`.

### Phase 0: Baseline and spec

- [x] Task 0: Commit the current state as the refactoring baseline
- [x] Task S1: Restructure the requirements into a spec split by area, with requirement ids

### Checkpoint: spec

- [x] The user reviews and approves `docs/requirements/` before any code changes

### Phase 1: Mock data only

- [x] Task 1: Fixed mock clock for the dev server
- [x] Task 2: Fictional people, local avatars, and fixture builders
- [x] Task 3: Generated typical board replaces the real snapshot
- [x] Task 4: Corner cases split by topic, all on fictional data
- [x] Task 5: Real names removed from source, tests, and docs
- [x] Task C1: Target repository from configuration, no default bots

### Checkpoint: mock data

- [x] No real login or real PR in the repository (grep check), tests and build pass, DEV panel works

### Phase 2: Browser test safety net

- [x] Task 6: Playwright setup with the mock server
- [x] Task 7: Browser tests for data loading and Refresh scenarios
- [x] Task 8: Browser tests for sorting, filters, search, and URL state
- [x] Task 9: Browser tests for popovers and the comments panel
- [x] Task 10: Browser tests for columns and settings

### Checkpoint: safety net

- [x] The full browser suite passes on the unrefactored code (100 tests, twice in a row); review with the user

### Phase 3: Split the large files

- [x] Task 11: Split `src/github.ts`
- [x] Task 12: Split `src/model.ts`
- [x] Task 13: Extract pure board logic from `src/app.tsx`
- [x] Task 14: Extract hooks
- [x] Task 15: Split table cell components
- [x] Task 16: Split header, toolbar, settings, and table components
- [x] Task 17: Split `src/styles.css`
- [ ] Task 18: Split the dev mock plugin and scenarios

### Checkpoint: structure

- [ ] No source file over about 300 lines, all suites pass, build passes, code-simplification pass done

### Phase 4: Unit coverage

- [ ] Task 19: Unit tests for the extracted modules
- [ ] Task 20: Coverage gate
- [ ] Task S2: Requirement coverage check

### Phase 5: Screenshot tests

- [ ] Task 21: Deterministic rendering
- [ ] Task 22: Screenshot suite

### Checkpoint: tests

- [ ] Unit coverage meets the gate, browser and screenshot suites pass twice in a row

### Phase 6: CI, docs, review

- [ ] Task 23: CI runs browser and screenshot tests
- [ ] Task 24: Docs and conventions
- [ ] Task 25: Final review with a fresh reviewer

- [x] Task P: Squash the local history before the first push, so no real data or organization name is published

### Checkpoint: complete

- [ ] Definition of done: tests pass, no regressions, behavior checked in the browser, docs updated

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| The split changes behavior unnoticed | High | Browser suite first; one module per task; all suites each time. |
| Screenshots differ between machines | Medium | Fixed clock, local fonts and avatars; Windows baselines only. |
| Global dev-server scenario state breaks parallel tests | Medium | One worker; scenarios reset in `beforeEach`. |
| Playwright adds about 150 MB and CI time | Medium | Chromium only; a separate cached CI job. |
| Self-hosted fonts change the published page | Low | The same IBM Plex families, one external host fewer. |
| No git history to undo a bad step | High | Task 0 commits the baseline; then one commit per task. |

## Decisions taken (October 28, 2026)

1. Commits: yes. A working branch, one commit for the baseline, then one commit per task.
2. Screenshots: Windows baselines only; Podman is available if Linux is ever needed.
3. Fonts: self-hosted from `@fontsource` (decided by the agent, see the architecture decisions).
4. No mention of the organization anywhere: the repository comes from configuration, the default extra bot list
   is empty, and all data is fictional.
5. Requirements: split into one file per area.
