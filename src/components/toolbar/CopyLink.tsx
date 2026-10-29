import { useEffect, useState } from 'react';

const COPIED_FEEDBACK_MS = 1800;

export function CopyLink() {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (state !== 'copied') return undefined;
    const timer = setTimeout(() => setState('idle'), COPIED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [state]);
  // Pages served without HTTPS have no clipboard API at all.
  const copy = () => {
    if (!navigator.clipboard) {
      setState('failed');
      return;
    }
    navigator.clipboard.writeText(window.location.href).then(() => setState('copied'), () => setState('failed'));
  };
  const label = state === 'copied' ? 'Link copied' : state === 'failed' ? 'Copy the address bar instead' : 'Copy link to this view';
  return <button type="button" className="btn ghost" onClick={copy}>{label}</button>;
}
