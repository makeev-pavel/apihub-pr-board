# APIHub PR board

A board of the open pull requests of one GitHub repository, published on GitHub Pages. It shows CI, review, and
merge-conflict state for each PR and flags PRs that need attention. The repository is set by configuration
(`PR_BOARD_REPO`), not in the code.

The requirements are in [docs/requirements/](docs/requirements/README.md).

## How it works

- A scheduled workflow (hourly on weekdays) queries the GitHub GraphQL API and publishes `prs.json` next to the page.
- The page is React and TypeScript, bundled by Vite.
- **Refresh** queries GitHub from the browser with the viewer's own fine-grained token, stored only in that browser.
- `src/github/` holds the query, the normalization, and the GitHub clients. The workflow and the page both use it.

## Using the board

- **Search** takes plain words and GitHub-style qualifiers: `label:bug`, `label:"good first issue"`, `author:`,
  `assignee:`, `reviewer:` (reviewed or requested), `area:be|fe|other`, `ci:failing`, `review:approved`,
  `is:draft|bot|conflict|stale|attention`, `no:issue|label|assignee|review`. A minus excludes: `-is:draft`.
  A linked issue number such as `885` finds its PR.
  The **?** button next to the field lists them. Click a label on a row to filter by it.
- **Area** (BE, FE, Other) comes from the labels and Conventional Commits scopes listed in Settings, `[BE]`/`[FE]`
  tags in the PR and issue titles, and `frontend/` or `backend/` paths in Dependabot titles.
- **Column widths** change by dragging the header edge, or with the arrow keys on a focused edge. They are saved
  in this browser; double-click an edge to reset that column.
- **Settings** (the gear next to Refresh): attention rules, BE/FE lists, extra bots, theme, density, visible
  columns, and the GitHub token. They are saved in this browser only.
- Click the last comment to open every comment of the PR in a panel on the right, rendered as GitHub Markdown.
  Without a token, GitHub allows 60 such loads an hour.
- The dot next to the tiles shows where the data comes from (gray for the hourly snapshot, green for live data)
  and how old it is. Click it for the exact time and the workflow run.
- Click **F** in the CI column to see which checks failed, with links to their logs.
- Click the Review code to see who approved or requested changes and whose review is still pending.
  A small number on the code counts the reviewers behind that decision, for example ✓2 for two approvals.
  A gray ◷ counter next to it shows how many requested reviewers have not answered yet.
- The table always fills the window: spare width goes to the Pull request and Last comment columns.

## Local development

Requires Node.js 22.18 or later.

```sh
npm install
npm run dev          # http://localhost:5173 with mock data and hot reload
npm test
npm run typecheck
```

The dev server injects a **DEV** panel in the bottom-right corner. Use it to switch scenarios:

- **prs.json on page load:** typical board plus corner cases, empty board, 300 PRs, project data unavailable,
  stale snapshot, slow load, missing file, invalid JSON, JSON without a PR list.
- **Refresh button:** success, pagination, partial GraphQL errors, fewer PRs than `totalCount`, slow response,
  401, 502, repository not found, network failure. Any token works in mock mode.

All mock data is fictional. `dev/fixtures/typical.ts` generates an ordinary board with a fixed seed, and
`dev/fixtures/cases/` holds the corner cases, one file per topic. Both are raw GraphQL nodes, so they go through the
same normalization as real data.

To work against real data:

```sh
GITHUB_TOKEN=$(gh auth token) PR_BOARD_REPO=owner/name npm run dev:live
```

## Deployment

1. In the repository settings, open **Pages** and set **Source** to **GitHub Actions**.
2. Under **Secrets and variables → Actions → Variables**, add `PR_BOARD_REPO` with the repository to show, as
   `owner/name`.
3. Push to `main`, or run the **Publish board** workflow manually.

The workflow uses the built-in `GITHUB_TOKEN`, which can read public repositories. If project membership is not
readable with it, the board shows a warning and reports such PRs as unchecked instead of guessing.
