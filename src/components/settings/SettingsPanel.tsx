import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { COLUMNS } from '../../board/columns.ts';
import type { View } from '../../board/view.ts';
import { AREAS } from '../../model/areas.ts';
import type { Rules } from '../../model/rules.ts';
import {
  DEFAULT_SETTINGS, DENSITIES, isValidStaleDays, MAX_STALE_DAYS, MIN_STALE_DAYS, parseList, THEMES,
} from '../../settings.ts';
import type { Settings } from '../../settings.ts';
import type { AreaId, Label } from '../../types.ts';

const TOKEN_HELP_URL = 'https://github.com/settings/personal-access-tokens/new';

export function SettingsPanel({ settings, onChange, token, setToken, refreshing, askForToken, onRefresh, canResetWidths, onResetWidths }: {
  settings: Settings;
  onChange: (settings: Settings) => void;
  token: string;
  setToken: (value: string) => void;
  refreshing: boolean;
  askForToken: boolean;
  onRefresh: (token: string) => void;
  canResetWidths: boolean;
  onResetWidths: () => void;
}) {
  const { rules } = settings;
  const [staleDraft, setStaleDraft] = useState(String(rules.staleDays));
  const [botsDraft, setBotsDraft] = useState(rules.extraBots.join(', '));
  const [tokenDraft, setTokenDraft] = useState('');
  const joinAreas = (modules: Rules['areaModules']) => ({ be: modules.be.join(', '), fe: modules.fe.join(', ') });
  const [areaDrafts, setAreaDrafts] = useState(() => joinAreas(rules.areaModules));
  useEffect(() => setStaleDraft(String(rules.staleDays)), [rules.staleDays]);
  useEffect(() => setBotsDraft(rules.extraBots.join(', ')), [rules.extraBots]);
  useEffect(() => setAreaDrafts(joinAreas(rules.areaModules)), [rules.areaModules]);

  const setRules = (changes: Partial<Rules>) => onChange({ ...settings, rules: { ...rules, ...changes } });
  const changeStale = (text: string) => {
    setStaleDraft(text);
    const days = Number(text);
    if (isValidStaleDays(days)) setRules({ staleDays: days });
  };
  const commitBots = () => setRules({ extraBots: parseList(botsDraft) });
  const commitArea = (id: AreaId) => setRules({ areaModules: { ...rules.areaModules, [id]: parseList(areaDrafts[id]) } });
  const toggleColumn = (id: string) => onChange({
    ...settings,
    hiddenColumns: settings.hiddenColumns.includes(id) ? settings.hiddenColumns.filter((c) => c !== id) : settings.hiddenColumns.concat(id),
  });
  const saveToken = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = tokenDraft.trim();
    if (!value) return;
    setToken(value);
    setTokenDraft('');
    onRefresh(value);
  };

  return (
    <div className="menu settings-panel" role="dialog" aria-label="Settings">
      <section>
        <h2>Attention rules</h2>
        <label className="inline-field">
          Stale after
          <input type="number" min={MIN_STALE_DAYS} max={MAX_STALE_DAYS} step={1} value={staleDraft}
            onChange={(e) => changeStale(e.target.value)} onBlur={() => setStaleDraft(String(rules.staleDays))} />
          days
        </label>
        <label>
          <input type="checkbox" checked={rules.checkTitle} onChange={() => setRules({ checkTitle: !rules.checkTitle })} />
          Title follows Conventional Commits
        </label>
        <label>
          <input type="checkbox" checked={rules.requireIssue} onChange={() => setRules({ requireIssue: !rules.requireIssue })} />
          Linked issue or GitHub Project
        </label>
        <label className="stacked-field" htmlFor="extra-bots">Extra bot logins</label>
        <input id="extra-bots" className="text-field" value={botsDraft} placeholder="login, login" autoComplete="off"
          onChange={(e) => setBotsDraft(e.target.value)} onBlur={commitBots}
          onKeyDown={(e) => { if (e.key === 'Enter') commitBots(); }} />
      </section>
      <section>
        <h2>Areas</h2>
        <p className="hint">Label names, with or without <code>module:</code>, and title scopes such as <code>fix(ui)</code>. Tags like [BE] and [FE] and backend/ or frontend/ paths always count.</p>
        {AREAS.map((area) => (
          <div key={area.id} className="area-field">
            <label className="stacked-field" htmlFor={'area-' + area.id}>{area.label}</label>
            <textarea id={'area-' + area.id} className="text-field" rows={3} value={areaDrafts[area.id]}
              onChange={(e) => setAreaDrafts({ ...areaDrafts, [area.id]: e.target.value })} onBlur={() => commitArea(area.id)} />
          </div>
        ))}
      </section>
      <section>
        <h2>View</h2>
        <div className="setting-row">
          <span>Theme</span>
          <div className="segmented" role="group" aria-label="Theme">
            {THEMES.map(([value, label]) => (
              <button key={value} type="button" aria-pressed={settings.theme === value} onClick={() => onChange({ ...settings, theme: value })}>{label}</button>
            ))}
          </div>
        </div>
        <div className="setting-row">
          <span>Density</span>
          <div className="segmented" role="group" aria-label="Density">
            {DENSITIES.map(([value, label]) => (
              <button key={value} type="button" aria-pressed={settings.density === value} onClick={() => onChange({ ...settings, density: value })}>{label}</button>
            ))}
          </div>
        </div>
      </section>
      <section>
        <h2>Columns</h2>
        <div className="column-options">
          {COLUMNS.map((col) => (
            <label key={col.id} title={col.required ? 'This column is always shown' : undefined}>
              <input type="checkbox" checked={col.required || !settings.hiddenColumns.includes(col.id)} disabled={col.required}
                onChange={() => toggleColumn(col.id)} />
              {col.label}
            </label>
          ))}
        </div>
        <button type="button" className="btn" disabled={!canResetWidths} onClick={onResetWidths}>Reset column widths</button>
      </section>
      <section>
        <h2>GitHub token</h2>
        <form className="token-form" onSubmit={saveToken}>
          <p>Refresh queries GitHub directly with your personal token. It stays in this browser and is sent only to api.github.com.</p>
          <p><a href={TOKEN_HELP_URL} target="_blank" rel="noopener">Create a fine-grained token</a> with public repository read access. No extra permissions are needed.</p>
          <label htmlFor="token-input">Token</label>
          <input id="token-input" type="password" autoComplete="off" autoFocus={askForToken}
            placeholder={token ? 'Saved. Paste a new one to replace it' : 'github_pat_…'}
            value={tokenDraft} onChange={(e) => setTokenDraft(e.target.value)} />
          <div className="actions">
            <button type="submit" className="btn primary" disabled={!tokenDraft.trim() || refreshing}>Save and refresh</button>
            {token ? <button type="button" className="btn" onClick={() => setToken('')}>Forget token</button> : null}
          </div>
        </form>
      </section>
      <div className="settings-foot">
        <span className="muted">Saved in this browser only.</span>
        <button type="button" className="btn" onClick={() => onChange({ ...DEFAULT_SETTINGS })}>Reset to defaults</button>
      </div>
    </div>
  );
}
