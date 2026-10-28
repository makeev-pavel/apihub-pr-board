import { useState } from 'react';

const COPIED_FEEDBACK_MS = 1800;

export function CopyLink() {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setState('copied');
      setTimeout(() => setState('idle'), COPIED_FEEDBACK_MS);
    }, () => setState('failed'));
  };
  const label = state === 'copied' ? 'Link copied' : state === 'failed' ? 'Copy the address bar instead' : 'Copy link to this view';
  return <button type="button" className="btn ghost" onClick={copy}>{label}</button>;
}
