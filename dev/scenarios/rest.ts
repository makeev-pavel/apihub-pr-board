import type { RawActor, RestComment, RestReview } from '../../src/github/raw.ts';
import { mixedEntries } from './entries.ts';

function restUser(actor: RawActor | null | undefined) {
  return actor ? { login: actor.login, avatar_url: actor.avatarUrl || null, type: actor.__typename === 'Bot' ? 'Bot' : 'User' } : null;
}

// The REST answers behind the comments panel: every comment and review of a mock PR, or null when it does not exist.
export function restComments(number: number, now: number): { comments: RestComment[]; reviews: RestReview[] } | null {
  const entry = mixedEntries(now).find(({ node }) => node.number === number);
  if (!entry) return null;
  const list = <T>(connection: { nodes?: (T | null)[] | null } | null | undefined) => ((connection && connection.nodes) || []).filter((n): n is T => n !== null);
  return {
    comments: list(entry.node.comments).map((c) => ({ created_at: c.createdAt, body: c.body, html_url: c.url, user: restUser(c.author) })),
    reviews: list(entry.node.reviews).map((r) => ({ submitted_at: r.submittedAt, body: r.body, html_url: r.url, user: restUser(r.author) })),
  };
}
