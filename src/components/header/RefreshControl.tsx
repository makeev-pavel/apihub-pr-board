import { useState } from 'react';
import type { Column } from '../../board/columns.ts';
import { useDismiss } from '../../hooks/useDismiss.ts';
import { rulesAreDefault } from '../../settings.ts';
import type { Settings } from '../../settings.ts';
import { SettingsPanel } from '../settings/SettingsPanel.tsx';

export function RefreshControl({ token, setToken, refreshing, onRefresh, settings, onSettingsChange, columns, canResetWidths, onResetWidths }: {
  token: string;
  setToken: (value: string) => void;
  refreshing: boolean;
  onRefresh: (token: string) => void;
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
  // The columns the board offers, shown or hidden.
  columns: Column[];
  canResetWidths: boolean;
  onResetWidths: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Refresh without a token opens the panel at the token field; the gear opens it at the top.
  const [askForToken, setAskForToken] = useState(false);
  const ref = useDismiss(open, setOpen);
  const custom = !rulesAreDefault(settings.rules);

  return (
    <div className="menu-wrap refresh" ref={ref}>
      <div className="refresh-buttons">
        <button type="button" className="btn primary" disabled={refreshing}
          onClick={() => { if (token) onRefresh(token); else { setAskForToken(true); setOpen(true); } }}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <button type="button" className="btn icon" aria-label={custom ? 'Settings (custom attention rules)' : 'Settings'}
          title={custom ? 'Settings. Your attention rules differ from the team defaults.' : 'Settings'}
          aria-expanded={open} onClick={() => { setAskForToken(false); setOpen(!open); }}>
          ⚙{custom ? <span className="dot" aria-hidden="true"></span> : null}
        </button>
      </div>
      {open ? (
        <SettingsPanel settings={settings} onChange={onSettingsChange} token={token} setToken={setToken} refreshing={refreshing} askForToken={askForToken}
          onRefresh={(value) => { setOpen(false); onRefresh(value); }} columns={columns} canResetWidths={canResetWidths} onResetWidths={onResetWidths} />
      ) : null}
    </div>
  );
}
