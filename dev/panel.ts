// DEV panel injected by dev/mock-plugin.ts: scenario switches. Never shipped to Pages.

interface ScenarioOption {
  id: string;
  label: string;
}

interface DevState {
  live: boolean;
  report: string;
  refresh: string;
  reportScenarios: ScenarioOption[];
  refreshScenarios: ScenarioOption[];
}

export {};

const COLLAPSED_KEY = 'apihub-pr-board.dev-panel-collapsed';

const style = document.createElement('style');
style.textContent = `
  #dev-panel { position: fixed; right: 12px; bottom: 12px; z-index: 100; width: 270px; font: 12px/1.4 var(--font-sans, system-ui);
    background: var(--surface, #fff); color: var(--fg, #111); border: 1px dashed var(--example-ink, #5b4a91);
    border-radius: 8px; box-shadow: var(--shadow, 0 6px 24px rgba(0,0,0,.15)); }
  #dev-panel header { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; cursor: pointer;
    color: var(--example-ink, #5b4a91); font-weight: 600; letter-spacing: .06em; }
  #dev-panel .body { display: grid; gap: 8px; padding: 0 10px 10px; }
  #dev-panel label { display: grid; gap: 3px; color: var(--muted, #555); }
  #dev-panel select { font: inherit; padding: 4px 6px; border-radius: 4px; border: 1px solid var(--line-strong, #ccc);
    background: var(--surface, #fff); color: var(--fg, #111); }
  #dev-panel.collapsed .body { display: none; }
  #dev-panel .hint { color: var(--muted, #555); }
`;
document.head.appendChild(style);

const panel = document.createElement('aside');
panel.id = 'dev-panel';
try { if (localStorage.getItem(COLLAPSED_KEY) === '1') panel.classList.add('collapsed'); } catch { /* ignore */ }
document.body.appendChild(panel);

function select(id: string, label: string, options: ScenarioOption[], value: string): string {
  const items = options.map((o) => `<option value="${o.id}"${o.id === value ? ' selected' : ''}>${o.label}</option>`).join('');
  return `<label for="${id}">${label}<select id="${id}">${items}</select></label>`;
}

function render(state: DevState) {
  panel.innerHTML = `
    <header><span>DEV · ${state.live ? 'live GitHub data' : 'mock data'}</span><span>${panel.classList.contains('collapsed') ? '▲' : '▼'}</span></header>
    <div class="body">
      ${state.live
        ? '<div class="hint">Scenarios are off. Restart without --mode live to use mocks.</div>'
        : select('dev-report', 'prs.json on page load', state.reportScenarios, state.report)
          + select('dev-refresh', 'Refresh button (GraphQL)', state.refreshScenarios, state.refresh)
          + '<div class="hint">Refresh accepts any token in mock mode.</div>'}
    </div>`;
  panel.querySelector('header')!.onclick = () => {
    panel.classList.toggle('collapsed');
    try { localStorage.setItem(COLLAPSED_KEY, panel.classList.contains('collapsed') ? '1' : '0'); } catch { /* ignore */ }
    render(state);
  };
  const report = panel.querySelector<HTMLSelectElement>('#dev-report');
  const refresh = panel.querySelector<HTMLSelectElement>('#dev-refresh');
  if (report) report.onchange = () => update({ report: report.value }, true);
  if (refresh) refresh.onchange = () => update({ refresh: refresh.value }, false);
}

function update(change: Partial<DevState>, reload: boolean) {
  fetch('/__dev/state', { method: 'POST', body: JSON.stringify(change) })
    .then((r) => r.json() as Promise<DevState>)
    .then((state) => (reload ? window.location.reload() : render(state)));
}

fetch('/__dev/state').then((r) => r.json() as Promise<DevState>).then(render);
