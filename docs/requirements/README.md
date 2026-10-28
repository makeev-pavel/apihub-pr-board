# PR board requirements

The board lists the open pull requests of one GitHub repository and shows what blocks each one: CI, review, merge
conflicts, and the team's own rules. It is a static page on GitHub Pages with an hourly data snapshot, and any
viewer can load live data with their own token.

These files are the spec. A change in behavior updates the matching requirement in the same change.

## Users and goals

- **Team lead at a daily or planning meeting:** sees every open PR, finds the stuck and problematic ones, and
  checks that PRs follow the team rules.
- **Developer:** finds their own PRs and sees what blocks them.

## Scope

- One repository, chosen by configuration. Open pull requests only, drafts included.
- Read-only: the board never changes anything on GitHub.
- Out of scope: other repositories at once, closed or merged PRs, history and charts, GitHub OAuth login (it would
  need a server).

## Files

| File | Id prefix | Covers |
| --- | --- | --- |
| [data.md](data.md) | `DATA` | Configuration, the snapshot, Refresh, collected fields, and data errors |
| [rules.md](rules.md) | `RULE` | CI, review, and conflict states; attention rules; bots; areas |
| [table.md](table.md) | `TABLE` | Header, columns, cells, sorting, empty and error states, layout, legend |
| [panels.md](panels.md) | `PANEL` | Popovers and the comments panel |
| [filters.md](filters.md) | `FILTER` | Quick filters, toolbar, search, and the view in the URL |
| [settings.md](settings.md) | `SET` | The settings panel and where settings are stored |
| [security.md](security.md) | `SEC` | Token handling, untrusted content, CI permissions, and dependencies |
| [quality.md](quality.md) | `QUAL` | Accessibility, browsers, size, themes, and responsiveness |
| [engineering.md](engineering.md) | — | Stack, commands, structure, style, testing, boundaries, success criteria |

## Conventions

- Each requirement starts with a bold id, such as **TABLE-4**. Ids never change and are never reused; a removed
  requirement keeps its id with the word *Removed*.
- *Planned* marks a requirement that is agreed but not built yet, with the task from `tasks/todo.md` that builds
  it. Everything else describes the board as it works now.
- Tests name the ids they cover. A requirement without a test is a gap (see the testing strategy in
  [engineering.md](engineering.md)).
- Examples use the fictional repository `acme/widgets` and fictional people such as `anna-dev` and `boris-k`.

## Known limitations

- Team review requests need read access to the organization. With the built-in `GITHUB_TOKEN` of the workflow they
  may come back empty, and the board then shows no pending team.
- Images in comments load from wherever their authors host them, so opening the comments panel lets those hosts
  see the viewer's address. GitHub itself proxies such images; the board does not.
- Without a token the comments panel shares GitHub's limit of 60 REST requests an hour per address.

## Maintenance notes

- The title rule copies the defaults of `amannn/action-semantic-pull-request`. If the repository configures its own
  `types` or `subjectPattern`, the allowed types in the code must follow (**RULE-6**).
- The default BE and FE lists follow the monorepo directories and need updating when modules are added
  (**RULE-11**). Viewers can extend them in Settings meanwhile.
- Aggregate CI jobs that fail whenever another job fails are listed last in the checks popover. Only `ci-ok` is
  known today (**PANEL-4**); add others when they appear.
