# Standup notes

A team lead asks about each PR at the daily meeting and writes down what the author said or promised. A developer can
keep the same notes for their own PRs. The next day the notes show what was promised.

- **NOTE-1** Each PR has a note per day: whether its status was asked that day, and free text, such as what was done
  or promised. A day is the viewer's local calendar day. A PR is identified by repository and number (**DATA-20**).
  *Planned: task N2.*
- **NOTE-2** Notes are kept in this browser (`localStorage`, under their own key) and are never sent anywhere. They
  survive reloads and Refresh, and stay after the PR is closed. A stored entry that is invalid is dropped, and the
  rest still loads. Each PR keeps its latest 100 days of notes. *Planned: task N2.*
- **NOTE-3** A Standup column, after Attention, shows a checkbox for "asked today" and today's text cut to two lines.
  Without a note today, it shows the latest earlier note faded, with its day, such as "Yesterday: fix the tests by
  noon". The column can be hidden in Settings (**SET-8**). *Planned: task N3.*
- **NOTE-4** Clicking the note opens a popover: the "asked today" checkbox, a text field for today's note, and the
  earlier notes newest first, each with its day and whether the status was asked. Today's text is saved when the
  field loses focus, on Ctrl+Enter, and when the popover closes. Checking the box or typing marks the PR as asked
  today. *Planned: task N3.*
- **NOTE-5** At midnight the checkboxes start empty for the new day; yesterday's notes become history. *Planned: task
  N3.*
- **NOTE-6** A quick filter tile, Not asked today, shows the PRs whose status has not been asked today (**FILTER-1**).
  *Planned: task N4.*
- **NOTE-7** The `note:` qualifier matches the text of any note of a PR, such as `note:tests`; `-note:` excludes.
  *Planned: task N4.*
