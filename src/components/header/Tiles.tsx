import { QUICK } from '../../board/view.ts';
import type { DerivedPullRequest } from '../../types.ts';

export function Tiles({ base, active, setQuick }: { base: DerivedPullRequest[]; active: string[]; setQuick: (quick: string[]) => void }) {
  return (
    <div className="tiles" role="group" aria-label="Quick filters">
      <button type="button" className="tile" aria-pressed={active.length === 0} onClick={() => setQuick([])}>
        <span className="count">{base.length}</span>
        <span className="label">Open PRs</span>
      </button>
      {QUICK.map((q) => {
        const count = base.filter(q.test).length;
        const pressed = active.includes(q.id);
        return (
          <button key={q.id} type="button"
            className={'tile tone-' + q.tone + (count === 0 ? ' zero' : '')}
            aria-pressed={pressed}
            title={pressed ? 'Click to remove this filter' : 'Click to show only these'}
            onClick={() => setQuick(pressed ? active.filter((id) => id !== q.id) : active.concat(q.id))}>
            <span className="count">{count}</span>
            <span className="label">{q.label}</span>
          </button>
        );
      })}
    </div>
  );
}
