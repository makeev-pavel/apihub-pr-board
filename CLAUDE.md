# PR board

A board of the open pull requests of one or more GitHub repositories, published on GitHub Pages.

- **Spec:** `docs/requirements/`. It is the source of truth: update the matching requirement in the same change
  when behavior changes, and keep requirement ids stable.
- **Stack, commands, structure, code style, testing, and boundaries:** `docs/requirements/engineering.md`.
- **Current work:** `tasks/plan.md` and `tasks/todo.md`. Mark tasks done as they land.

## Layout

- `src/github/`: the GitHub side, shared by the snapshot script and the page, so it must not use Node APIs.
  `query.ts` (the GraphQL query), `raw.ts` (raw GraphQL and REST types), `normalize.ts` (raw nodes to `PullRequest`),
  `graphql.ts` (open PRs, page by page), `rest.ts` (all comments of one PR), `http.ts` (shared error and fetch type).
- `src/types.ts`: the shape of `prs.json` and of derived rows. Raw GraphQL types live in `src/github/raw.ts`.
- `src/model/`: rules without UI, one concern each: `rules.ts` (attention, bots, titles), `areas.ts`, `search.ts`,
  `derive.ts` (per-PR fields), `comments.ts`, `report.ts` (`prs.json` shape). Tests mirror it in `test/model/`.
- `src/repository.ts` and `src/config.ts`: optional default repositories from `PR_BOARD_REPO` (a list), passed to the
  page by Vite `define`. `vite.config.ts` parses it once; with mock data the dev server always uses `acme/widgets`.
  A PR is identified by repository and number (`pullRequestKey` in `src/model/report.ts`), never by number alone.
- `src/board/`: board logic without React: state codes (`states.ts`), columns and widths, the view and its URL,
  filtering and sorting rows (`view.ts`), the repositories and extra bots in the address (`link.ts`), authors,
  failed-check grouping, text formatting, and `localStorage`. Also notes (`notes.ts`), repository groups
  (`groups.ts`), the Reviewers list (`reviewers.ts`), and the live load's status in words (`progress.ts`).
- `src/hooks/`: `usePopover` (and `useDismiss`), `useReportData` (loads `prs.json`), `useLiveLoad` (a live load
  from GitHub, its status, and its error), `useAllComments` (the comments panel's REST load, cached per PR version),
  `useColumnWidths` (saved, dragged, and fitted widths), `useBoardSettings` (stored settings plus the extra bots
  from the address), `useNotes` (notes, with changes storage refused).
  `src/context.ts`: the viewer's rules, the comments API, notes, and how the Review column shows reviews.
- `src/settings.ts`: personal settings in `localStorage`, validated on load. Extra bots are not stored there; they
  live in the address (`bots`).
- `src/markdown.ts`: comment Markdown through `marked` and DOMPurify; browser only.
- `src/components/`: React components, one per file: `common/`, `cells/` (table cells and their popovers), `header/`,
  `toolbar/`, `table/`, `legend/`, and `settings/`.
- `src/App.tsx`: composes the page; `src/main.tsx`: the entry point and the stylesheets in cascade order.
- `src/styles/`: `tokens.css` (all colors and fonts, both themes) and one file per area of the page.
- `dev/mock-plugin.ts`: the Vite plugin that serves the mocks (helpers in `dev/http.ts`) and injects
  `dev/panel.ts`, the DEV panel. `dev/scenarios/`: what `/prs.json`, the GraphQL mock, and the REST mock answer.
  `dev/fixtures/`: the fictional cast, the generated typical board, the second repository (`gadgets.ts`), and the
  corner cases by topic (`cases/`; add a case to the matching topic file).
- `.github/workflows/pages.yml`: on a push to `main`, the unit and browser tests, then the page without data, then the
  Pages deploy. `scripts/build-site.ts` writes an optional `prs.json` snapshot; the workflow does not run it.
- `test/`: unit tests, one file per module, mirroring `src/`. `e2e/`: browser tests, one spec per area of the page,
  `helpers.ts`, and `screenshots.spec.ts` with its baselines in `e2e/__screenshots__`.
- `docs/adr/`: decision records; `0001-test-stack.md` explains the three test layers.

## Working rules

- New tests go where their code lives: a unit test in the `test/` file that mirrors the module, a browser test in
  the `e2e/` spec of its area, a visual state in `e2e/screenshots.spec.ts`, and a display rule's data in a corner case.
- When a field is added to the query (`src/github/query.ts`), update `raw.ts`, `normalizePullRequest`, `src/types.ts`,
  the fixtures, a corner case, and the tests.
- UI text, code comments, and docs are in English. Talk to the user in Russian.
- Never name the target organization or real people in the repository (see the boundaries in the spec).
- Commits go to the working branch as tasks land; push only when the user confirms.

## Gotchas

- The mocks run inside the Vite config, so Vite restarts when `src/github/` or anything under `dev/` changes.
  Edits to other `src/` files hot-reload.
- The Playwright MCP browser can open the dev server and take screenshots; it writes only inside the repository
  (`.playwright-mcp/`, ignored by git).
- Node's test runner cannot load `.tsx`; test React code through the browser (`npm run test:e2e`). Playwright
  starts its own Vite on port 5174 with `PR_BOARD_MOCK_NOW`, so it does not touch the dev server on 5173.
- A new browser test must be seen failing once (break its expectation, run, restore): it is written against code
  that already works.
- Screenshot baselines (`e2e/__screenshots__`) are Windows-only. A visual change needs
  `npm run test:screenshots:update`, a look at every changed image, and the images in the same commit.
- `core.autocrlf` is on for this machine; `.gitattributes` keeps LF in the repository.
- Shell heredocs here turn `\\n` into a real newline; edit escape sequences in source with the Edit tool.

## Status

Pushed to GitHub (`refactor/final-structure` and `main`); Pages deploys from `main`. The published page has no
data: viewers open it with `?repos=owner/name` and their own token. History was squashed on October 28, 2026, so no
commit holds real data; keep it that way.
