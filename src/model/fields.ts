// Checks shared by the GraphQL normalization and the prs.json parser for the issue type, priority, and sprint values,
// so a value is accepted the same way whichever way it arrives.

import { ISSUE_TYPE_COLORS } from '../types.ts';
import type { IssueTypeColor, Sprint } from '../types.ts';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// GitHub's color names, any case; an unknown one becomes null and shows as a neutral dot.
export function knownColor(color: unknown): IssueTypeColor | null {
  const lower = typeof color === 'string' ? color.toLowerCase() : '';
  return (ISSUE_TYPE_COLORS as readonly string[]).includes(lower) ? lower as IssueTypeColor : null;
}

export function parseNamedColor(value: unknown): { name: string; color: IssueTypeColor | null } | null {
  const entry = value as { name?: unknown; color?: unknown } | null;
  return entry && typeof entry === 'object' && typeof entry.name === 'string' ? { name: entry.name, color: knownColor(entry.color) } : null;
}

export function parseSprint(value: unknown): Sprint | null {
  const entry = value as Partial<Sprint> | null;
  if (!entry || typeof entry !== 'object' || typeof entry.title !== 'string' || !DAY.test(entry.startDate || '')) return null;
  if (typeof entry.duration !== 'number' || !(entry.duration > 0)) return null;
  return { title: entry.title, startDate: entry.startDate!, duration: entry.duration };
}
