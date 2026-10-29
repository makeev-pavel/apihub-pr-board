import { useEffect, useState } from 'react';

export const TOKEN_HELP_URL = 'https://github.com/settings/personal-access-tokens/new';

// Explains how to create a token and takes it (SET-18). There is no <form>, so browsers do not offer to save the token
// as a password and sync it outside this browser.
export function TokenDialog({ onSave, onClose }: { onSave: (token: string) => void; onClose: () => void }) {
  const [draft, setDraft] = useState('');
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const save = () => { if (draft.trim()) onSave(draft.trim()); };

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="token-dialog" role="dialog" aria-modal="true" aria-labelledby="token-dialog-title">
        <h2 id="token-dialog-title">Add a GitHub token</h2>
        <p>The board reads pull requests from GitHub with your own token. It stays in this browser and is sent only to
          api.github.com.</p>
        <ol>
          <li>Open <a href={TOKEN_HELP_URL} target="_blank" rel="noopener">Create a fine-grained token</a> on GitHub.</li>
          <li>Give it any name and expiry.</li>
          <li>Under <strong>Repository access</strong>, choose <strong>Public repositories (read-only)</strong>. No other
            permissions are needed.</li>
          <li>Click <strong>Generate token</strong> and copy the value that starts with <code>github_pat_</code>.</li>
        </ol>
        <label htmlFor="token-dialog-input">Token</label>
        <input id="token-dialog-input" type="password" autoComplete="off" autoFocus placeholder="github_pat_…" value={draft}
          onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') save(); }} />
        <div className="actions">
          <button type="button" className="btn primary" disabled={!draft.trim()} onClick={save}>Save and load</button>
          <button type="button" className="btn" onClick={onClose}>Not now</button>
        </div>
      </div>
    </div>
  );
}
