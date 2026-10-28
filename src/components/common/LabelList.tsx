import { useState } from 'react';
import { labelTextColor } from '../../board/format.ts';
import type { Label } from '../../types.ts';

const VISIBLE_LABELS = 4;

function LabelChip({ label, active, onToggle }: { label: Label; active: boolean; onToggle: (name: string) => void }) {
  const style = label.color ? { background: '#' + label.color, color: labelTextColor(label.color) } : undefined;
  const hint = (label.description ? label.description + '. ' : '') + (active ? 'Click to remove this filter' : 'Click to filter by this label');
  return (
    <button type="button" className={'label-chip' + (active ? ' active' : '')} style={style} title={hint}
      aria-pressed={active} onClick={() => onToggle(label.name)}>{label.name}</button>
  );
}

export function LabelList({ labels, activeLabels, onToggle }: { labels: Label[]; activeLabels: Set<string>; onToggle: (name: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? labels : labels.slice(0, VISIBLE_LABELS);
  const hidden = labels.length - shown.length;
  return (
    <>
      {shown.map((l) => <LabelChip key={l.name} label={l} active={activeLabels.has(l.name.toLowerCase())} onToggle={onToggle} />)}
      {hidden > 0 ? (
        <button type="button" className="label-more" title={labels.slice(VISIBLE_LABELS).map((l) => l.name).join(', ')}
          onClick={() => setExpanded(true)}>+{hidden}</button>
      ) : null}
      {expanded && labels.length > VISIBLE_LABELS ? <button type="button" className="label-more" onClick={() => setExpanded(false)}>less</button> : null}
    </>
  );
}
