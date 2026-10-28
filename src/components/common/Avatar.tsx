import { useState } from 'react';
import { initials } from '../../board/format.ts';
import type { Actor } from '../../types.ts';

export function Avatar({ actor, small = false }: { actor: Actor | null; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  const cls = 'avatar' + (small ? ' sm' : '');
  if (!actor || !actor.avatarUrl || failed) {
    return <span className={cls} aria-hidden="true">{actor ? initials(actor.login) : '?'}</span>;
  }
  return <img className={cls} src={actor.avatarUrl} alt="" loading="lazy" onError={() => setFailed(true)} />;
}
