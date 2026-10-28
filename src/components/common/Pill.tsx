import type { StateInfo } from '../../board/states.ts';

export function Pill({ state }: { state: StateInfo }) {
  const tooltip = state.label + (state.hint ? ': ' + state.hint : '');
  return <span className={'pill short ' + state.tone} title={tooltip} aria-label={state.label}>{state.short}</span>;
}
