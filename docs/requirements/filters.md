# Filters, search, and the view

## Quick filters

- **FILTER-1** Tiles in the header: Open PRs, CI failing, Without approval, Merge conflicts, Need attention. Each
  shows how many PRs of the current view (authors, draft status, area, and search) match it.
- **FILTER-2** Clicking a tile turns its filter on or off; active tiles combine with AND. Open PRs turns them all
  off. A tile with no matching PRs is dimmed.

## Toolbar

- **FILTER-3** Authors: a menu with People and Bots groups, each author with an avatar and the number of open PRs,
  and the presets People (the default: everyone except bots), Bots, Everyone, and Clear. The button names the
  choice: People, Bots, Everyone, Nobody, one login, or "N selected".
- **FILTER-4** The author list follows the data: a Refresh adds new authors and drops gone ones. A chosen author
  without open PRs leaves the count but stays in the URL, so the choice returns when they open a PR. Choosing every
  person or every bot by hand switches to the matching preset.
- **FILTER-5** Draft status: All, Ready for review (the default), Drafts.
- **FILTER-6** Area: All, BE, FE, Other (**RULE-11**). A PR in both areas shows under BE and under FE.
- **FILTER-7** **Reset view** shows when the view differs from the default and restores it. **Copy link to this
  view** copies the page address, says "Link copied", and asks to copy the address bar when the clipboard is blocked.

## Search

- **FILTER-8** Plain words match the number, title, people, labels, target branch, issue titles and numbers (`885`
  or `#885`), projects, failed check names and workflows, both comments, and the attention reasons, without regard
  to case. Every word must match; a leading minus excludes; quotes keep spaces.
- **FILTER-9** Qualifiers narrow the list and also take a leading minus:

  | Qualifier | Example |
  | --- | --- |
  | `author:` | `author:anna-dev` |
  | `assignee:` | `assignee:boris-k`, `assignee:none` |
  | `reviewer:` | `reviewer:chen-li` (reviewed or requested) |
  | `label:` | `label:bug`, `label:"good first issue"`, `label:none` |
  | `base:` | `base:develop` |
  | `area:` | `area:be`, `area:fe`, `area:other` |
  | `ci:` | `ci:failing`, `ci:running`, `ci:passing`, `ci:none` |
  | `review:` | `review:approved`, `review:changes`, `review:none` |
  | `is:` | `is:draft`, `is:ready`, `is:bot`, `is:conflict`, `is:stale`, `is:attention` |
  | `no:` | `no:issue`, `no:label`, `no:assignee`, `no:review` |

- **FILTER-10** A qualifier still being typed, such as `label:`, filters nothing yet. An unknown qualifier is a
  plain word.
- **FILTER-11** Clicking a label chip adds `label:<name>` to the search, quoted when the name has spaces. Clicking it
  again removes every positive filter for that label, whatever its case or quoting, and leaves other words alone.
  Chips of labels in the search are highlighted.
- **FILTER-12** The **?** button next to the search lists the syntax and offers examples that fill the search when
  clicked.

## View in the URL

- **FILTER-13** Search, authors, draft status, area, quick filters, and sort live in the URL query (`q`, `authors`,
  `draft`, `area`, `quick`, `sort`, `dir`). Defaults are left out, so the default view has a clean address. Opening
  a link restores the view; unknown values fall back to the defaults.
- **FILTER-14** The address also carries two settings: `repos`, the repositories to show
  (`repos=acme/widgets,acme/gadgets`), and `bots`, the extra bot logins (**SET-5**). Copy link keeps them, and
  **Reset view** leaves them alone. Without `repos` the board shows every repository of the data; without `bots`
  there are no extra bots. Invalid entries are dropped: a repository must be `owner/name` (up to 10), and a bot a
  GitHub login (up to 50).

## Several repositories

- **FILTER-15** The `repo:` qualifier matches the repository name or `owner/name`, such as `repo:gadgets` or
  `-repo:acme/widgets`. Plain words match the repository name too.
