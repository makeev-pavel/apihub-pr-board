# PR board

A board of the open pull requests of one GitHub repository, published on GitHub Pages.

- **Spec:** `docs/requirements/`. It is the source of truth: update the matching requirement in the same change
  when behavior changes, and keep requirement ids stable.
- **Stack, commands, structure, code style, testing, and boundaries:** `docs/requirements/engineering.md`.
- **Current work:** `tasks/plan.md` and `tasks/todo.md`. Mark tasks done as they land.

## Layout

- `src/github/`: the GitHub side, shared by the scheduled build and the page, so it must not use Node APIs.
  `query.ts` (the GraphQL query), `raw.ts` (raw GraphQL and REST types), `normalize.ts` (raw nodes to `PullRequest`),
  `graphql.ts` (open PRs, page by page), `rest.ts` (all comments of one PR), `http.ts` (shared error and fetch type).
- `src/types.ts`: the shape of `prs.json` and of derived rows. Raw GraphQL types live in `src/github/raw.ts`.
- `src/model/`: rules without UI, one concern each: `rules.ts` (attention, bots, titles), `areas.ts`, `search.ts`,
  `derive.ts` (per-PR fields), `comments.ts`, `report.ts` (`prs.json` shape). Tests mirror it in `test/model/`.
- `src/repository.ts` and `src/config.ts`: the target repository from `PR_BOARD_REPO`, passed to the page by Vite
  `define`. `vite.config.ts` parses it once; with mock data the dev server always uses `acme/widgets`.
- `src/board/`: board logic without React: state codes (`states.ts`), columns and widths, the view and its URL,
  filtering and sorting rows (`view.ts`), authors, failed-check grouping, text formatting, and `localStorage`.
- `src/hooks/`: `usePopover` (and `useDismiss`), `useReportData` (loads `prs.json`), `useAllComments` (the comments
  panel's REST load, cached per PR version), `useColumnWidths` (saved, dragged, and fitted widths). `src/context.ts`: the viewer's rules and the comments API.
- `src/settings.ts`: personal settings in `localStorage`, validated on load.
- `src/markdown.ts`: comment Markdown through `marked` and DOMPurify; browser only.
- `src/components/`: React components, one per file: `common/`, `cells/` (table cells and their popovers), `header/`,
  `toolbar/`, `table/`, `legend/`, and `settings/`.
- `src/App.tsx`: composes the page; `src/main.tsx`: the entry point and the stylesheets in cascade order.
- `src/styles/`: `tokens.css` (all colors and fonts, both themes) and one file per area of the page.
- `dev/mock-plugin.ts`, `dev/scenarios.ts`, `dev/panel.ts`: the Vite plugin with the mocks, the scenarios, and the
  DEV panel. `dev/fixtures/`: the fictional cast, the generated typical board, and the corner cases by topic
  (`cases/`; add a case to the matching topic file).
- `scripts/build-site.ts` and `.github/workflows/pages.yml`: the hourly build and the Pages deploy.

## Working rules

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
- `core.autocrlf` is on for this machine; `.gitattributes` keeps LF in the repository.
- Shell heredocs here turn `\\n` into a real newline; edit escape sequences in source with the Edit tool.

## Status

Built and tested locally, committed on `refactor/final-structure`, not pushed or deployed. Before the first deploy:
set **Settings → Pages → Source** to **GitHub Actions** and add the `PR_BOARD_REPO` repository variable. History was
squashed on October 28, 2026, so no commit holds real data; keep it that way.
