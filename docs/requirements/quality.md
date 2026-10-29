# Quality

## Accessibility

- **QUAL-1** Every button that shows only an icon or a code has an accessible name that says what it does and, for
  states, what the state is ("Failing", "Changes requested by 2 reviewers, 1 pending reviewer on PR #12").
- **QUAL-2** Buttons that open a popover or menu report whether it is open. Sortable headers report the sort order.
  Toggle buttons (tiles, segmented controls, label chips) report whether they are pressed.
- **QUAL-3** Everything works from the keyboard: popovers close on Escape, column edges take focus and resize with
  the arrow keys, and focus is always visible.
- **QUAL-4** Status is never shown by color alone: every colored code has a letter or symbol, and the stripe colors
  repeat the CI code in the same row.
- **QUAL-5** Animations stop when the system asks for reduced motion.

## Look

- **QUAL-6** Light and dark themes share one set of color tokens. Colors in the stylesheet come only from these
  tokens (`src/styles/tokens.css`).
- **QUAL-7** Text and code use IBM Plex Sans and IBM Plex Mono, served with the page (**SEC-8**), with system fonts
  as the fallback.

## Size and browsers

- **QUAL-8** The board stays responsive with 300 open PRs: filtering, sorting, and opening popovers take no visible
  delay on an ordinary laptop.
- **QUAL-9** Supported browsers: the current versions of Chrome, Edge, Firefox, and Safari. *Manual check: the
  browser tests run in Chromium only, so open the board in Firefox and Safari before a release.*
- **QUAL-10** Times show relative to now and refresh every minute without a reload.
