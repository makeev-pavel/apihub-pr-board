import type { StateInfo } from '../../board/states.ts';

export function Pill({ state, hint }: { state: StateInfo; hint?: string }) {
  const tooltip = state.label + (hint || state.hint ? ': ' + (hint || state.hint) : '');
  return <span className={'pill short ' + state.tone} title={tooltip} aria-label={state.label}>{state.short}</span>;
}
