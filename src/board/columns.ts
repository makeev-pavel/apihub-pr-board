// The table columns, their default widths, and how spare width is shared out.

import type { SortKey } from './view.ts';

export const MIN_COLUMN_PX = 56;
export const RESIZE_STEP_PX = 16;

export interface Column {
  id: string;
  sort: SortKey | null;
  label: string;
  cls: string;
  width: number;
  hint?: string;
  // Always shown: a row makes no sense without it.
  required?: boolean;
}

export type Widths = Record<string, number>;

export const COLUMNS: Column[] = [
  { id: 'number', sort: 'number', label: '#', cls: 'c-num', width: 72, required: true },
  { id: 'title', sort: 'title', label: 'Pull request', cls: 'c-title', width: 460, required: true },
  { id: 'author', sort: 'author', label: 'Author', cls: 'c-person', width: 170 },
  { id: 'ci', sort: 'ci', label: 'CI', cls: 'c-state', width: 60 },
  { id: 'review', sort: 'review', label: 'Review', cls: 'c-state', width: 80 },
  { id: 'merge', sort: 'merge', label: 'Conflicts', cls: 'c-state', width: 96 },
  { id: 'age', sort: 'age', label: 'Age · activity', cls: 'c-age', width: 132 },
  { id: 'assignee', sort: null, label: 'Assignee', cls: 'c-person', width: 170 },
  { id: 'comment', sort: null, label: 'Last comment', cls: 'c-comment', width: 300 },
  { id: 'attention', sort: 'attention', label: 'Attention', cls: 'c-attn', width: 104, hint: 'Click an icon to see why the PR needs attention' },
];
export const DEFAULT_WIDTHS: Widths = Object.fromEntries(COLUMNS.map((c) => [c.id, c.width]));

// Columns that absorb spare width so the table always fills the window.
export const FLEX_COLUMNS = ['title', 'comment'];

// Widen flexible columns until the table fills the available width. The column being resized is
// left alone so it follows the pointer, and saved widths stay as the user set them. When the flexible columns are
// hidden or being resized, the last visible column takes the spare width.
export function fitToWidth(base: Widths, available: number, resizingId: string | null, columns: Column[]): Widths {
  const total = columns.reduce((sum, c) => sum + base[c.id], 0);
  if (!available || total >= available) return base;
  let flex = FLEX_COLUMNS.filter((id) => id !== resizingId && columns.some((c) => c.id === id));
  if (!flex.length) flex = [columns[columns.length - 1].id];
  const extra = available - total;
  const share = Math.floor(extra / flex.length);
  const fitted = { ...base };
  flex.forEach((id, i) => { fitted[id] += share + (i === 0 ? extra - share * flex.length : 0); });
  return fitted;
}
