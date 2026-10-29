# Data

## Configuration

- **DATA-1** The published page needs no configuration: viewers name the repositories in the link (**FILTER-14**)
  or in Settings (**SET-16**). `PR_BOARD_REPO` (`owner/name`, an environment variable) names them for a snapshot
  (`scripts/build-site.ts`) and for live mode; when it is set but malformed, the build stops with a message naming
  the variable. Nothing in the repository names the target organization.
- **DATA-2** With mock data the dev server always shows the fictional `acme/widgets`, whatever `PR_BOARD_REPO`
  says. Live mode (`npm run dev:live`) works like the published page; with `GITHUB_TOKEN` and `PR_BOARD_REPO` set, it
  also serves those repositories as a `prs.json` snapshot.

## Snapshot

- **DATA-3** The workflow runs on every push to `main` and on demand. It builds the page and publishes it on GitHub
  Pages without data: it calls no GitHub API and no step sees a token. A snapshot can be added back by running
  `scripts/build-site.ts` after the build.
- **DATA-4** When `prs.json` is published next to the page, the page opens with it, so it works without a token. The
  dev server's mocks always serve one; the published page has none and loads live data (**DATA-23**).
- **DATA-5** `prs.json` holds the repository name, the generation time, the workflow run link, warnings, and the
  normalized PRs. The page checks its shape: a file without a PR list counts as broken, missing optional fields
  get defaults, and an entry without a positive whole PR number is skipped.

## Refresh

- **DATA-6** **Refresh** queries GitHub from the browser with the viewer's fine-grained token (public repository
  read access) and replaces the data on the page. The page then marks the data as live.
- **DATA-7** A second Refresh cannot start while one is running.
- **DATA-8** Refresh skips the parts of the query that only hidden columns show: failed check details when CI is
  hidden, and comment and review bodies when Last comment is hidden. Search cannot match comment text until a
  refresh with the column shown. The snapshot is shared and always complete.

## Collected fields

- **DATA-9** One GraphQL query, 20 PRs a page, newest first, collects for each open PR. GitHub stops a query after
  about ten seconds, so a page that times out (HTTP 502 to 504, or a failed fetch, which is how a timeout without CORS
  headers looks in the browser) is asked again with half as many PRs, down to five, and later pages keep that size.
  For each PR the query collects:
  - number, title, URL, draft flag, target branch, created and updated time, and mergeability;
  - the author and up to 10 assignees, with avatars, and whether the author is a GitHub bot;
  - up to 30 labels with color and description;
  - up to 10 linked issues from the Development field (number, title, URL) and up to 10 GitHub Projects;
  - the latest decision of up to 20 reviewers and up to 20 pending review requests, users and teams;
  - the overall CI state of the last commit and, for failing PRs only, the failed checks among the first 100;
  - the last 5 issue comments and the last 10 review summaries.
- **DATA-10** Only the two newest comments are kept, issue comments and review summaries together. Comments that are
  empty or hold only HTML comment markers are skipped. Each kept body is cut at 4,000 characters and marked as cut.
- **DATA-11** A label color that is not six hex digits is dropped, and the label shows in neutral colors.
- **DATA-12** Entries that GitHub returns as `null` inside lists are skipped.

## Errors

- **DATA-13** An HTTP error, a GraphQL error, a response that is not JSON, or a network failure stops the build or
  the refresh with a readable message. A rejected token says to create a new one.
- **DATA-14** A forbidden Projects field is a partial error: the data loads, the page shows a warning, and project
  membership counts as unknown instead of empty.
- **DATA-15** When GitHub returns fewer PRs than its `totalCount`, the page shows a warning.
- **DATA-16** A missing `prs.json` (HTTP 404) means there is no snapshot, which is not an error (**DATA-23**). When
  it is broken or another HTTP error comes back, the page says so and suggests Refresh with a token.
- **DATA-23** Without a snapshot, the page loads live data by itself when it has a saved token and requested
  repositories: as soon as it opens, and again when the requested repositories or the token change. Each set of
  repositories and token loads once, so a repository that cannot be read does not load again and again. Without a
  token, a banner names the repositories and says to add a token in Settings. Without requested repositories, the
  table says to choose them in Settings or to open a link with `?repos=owner/name`.

## Several repositories

- **DATA-17** `PR_BOARD_REPO` takes up to 10 repositories separated by commas, such as
  `acme/widgets, acme/gadgets`. Spaces are ignored and a repeated repository counts once, without regard to case.
  An entry that is not `owner/name` stops the build with a message naming the variable and the entry.
- **DATA-18** The snapshot reads every repository of `PR_BOARD_REPO`, and Refresh every repository on the page,
  one after another with the query of **DATA-9**. The PRs of all repositories come newest first. A repository that
  does not exist or that the token cannot read, such as one behind SAML enforcement, is named in a warning with the
  reason GitHub gives, and the others load; with one repository, or when none can be read, it fails as in
  **DATA-13**. With several repositories, the **DATA-15** warning names the repository.
- **DATA-19** `prs.json` lists the repositories it covers, and each PR names its repository. A file written before
  this change, with one repository and PRs without one, still loads: its PRs belong to that repository. A PR
  whose repository is missing, not `owner/name`, or not in the file's list gets the file's only repository, or none
  when there are several.
- **DATA-20** A PR is identified by its repository and number. Two PRs with the same number in different
  repositories are two rows with their own comments, and the comments panel reads each PR from its own repository.
- **DATA-21** With mock data the dev server shows `acme/widgets` alone by default. A DEV panel scenario adds the
  fictional `acme/gadgets`, with PR numbers that repeat those of `acme/widgets`.
- **DATA-22** When the address asks for repositories (**FILTER-14**) that the data on the page does not cover, the
  page shows the PRs of the requested repositories it has and a banner naming the missing ones and whether the data
  is a snapshot or live. **Refresh** with a token then loads every requested repository. Without a token,
  the banner suggests adding one.
