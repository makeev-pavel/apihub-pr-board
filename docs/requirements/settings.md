# Settings

- **SET-1** The gear next to **Refresh** opens one settings panel. Changes apply at once. The panel scrolls when the
  window is short, and its footer says that settings stay in this browser.

| Id | Section | Setting | Default |
| --- | --- | --- | --- |
| **SET-2** | Attention rules | Stale after N days, a whole number from 1 to 365 (**RULE-7**). | 10 |
| **SET-3** | Attention rules | Check the title against Conventional Commits (**RULE-6**). | On |
| **SET-4** | Attention rules | Require a linked issue or a GitHub Project (**RULE-8**). | On |
| **SET-5** | Attention rules | Extra bot logins, separated by commas or spaces (**RULE-10**). | Empty |
| **SET-6** | Areas | BE and FE lists of labels and title scopes (**RULE-11**). | Monorepo modules; `ui-tests` is FE |
| **SET-7** | View | Theme: System, Light, or Dark. Density: Comfortable or Compact rows. | System, Comfortable |
| **SET-8** | Columns | Show or hide each column except # and Pull request; **Reset column widths**. | All shown |
| **SET-9** | GitHub token | Save, replace, or forget the token for Refresh and the comments panel. | None |

- **SET-10** When an attention rule differs from its default, the gear shows a dot, the legend shows **Custom
  rules**, and the Rules popover lists the values in use (**PANEL-7**). Other viewers may then see a different
  Attention count.
- **SET-11** Settings, the token, and the column widths are stored in this browser (`localStorage`), each under its
  own key, and survive reloads. A stored value that is missing or invalid falls back to its default, field by
  field, so an old or edited entry never breaks the page.
- **SET-12** **Reset to defaults** restores the rules, areas, view, and columns. It keeps the token and the column
  widths.
- **SET-13** **Refresh** without a token opens the panel with the token field focused. Opening the panel from the
  gear does not jump to the token.
- **SET-14** A number field keeps the last valid value: an invalid entry does not apply and is replaced when the
  field loses focus. Lists apply when their field loses focus or on Enter.
- **SET-15** Compact density makes rows tighter and avatars smaller. Theme Light or Dark overrides the system
  setting; System follows it.
