// Text the board shows: counts, ages, relative times, logins, and label text colors.

import type { Actor } from '../types.ts';

// Relative luminance above which a label background needs dark text.
const LIGHT_LABEL_LUMINANCE = 0.45;

const MINUTE_MS = 60 * 1000;

export function plural(n: number, word: string): string {
  return n + ' ' + word + (n === 1 ? '' : 's');
}
export function formatAge(days: number): string {
  return days === 0 ? 'today' : plural(days, 'day');
}
export function formatAgo(iso: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(iso)) / MINUTE_MS);
  if (minutes < 60) return minutes <= 1 ? 'just now' : minutes + ' min ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return plural(hours, 'hour') + ' ago';
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : days + ' days ago';
}
export function displayLogin(actor: Actor): string {
  return actor.login.replace(/\[bot\]$/, '');
}
export function initials(login: string): string {
  const parts = login.replace(/\[bot\]$/, '').split(/[-_.\s]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : login.slice(0, 2)).toUpperCase();
}

export function labelTextColor(hex: string): string {
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > LIGHT_LABEL_LUMINANCE ? 'var(--label-ink-dark)' : 'var(--label-ink-light)';
}
