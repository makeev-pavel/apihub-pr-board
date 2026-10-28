import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { authorsSummary, collectAuthors, selectedAuthors, toggleAuthor } from './board/authors.ts';
import type { AuthorEntry } from './board/authors.ts';
import { COLUMNS, DEFAULT_WIDTHS, fitToWidth, FLEX_COLUMNS, MIN_COLUMN_PX, RESIZE_STEP_PX } from './board/columns.ts';
import type { Column, Widths } from './board/columns.ts';
import { displayLogin, formatAge, formatAgo } from './board/format.ts';
import { CI, LEGEND, MERGE, REVIEW } from './board/states.ts';
import { readColumnWidths, readToken, storeToken, writeColumnWidths } from './board/storage.ts';
import {
  AREA_OPTIONS, DEFAULT_VIEW, DRAFT_OPTIONS, filterPullRequests, QUICK, readView, visibleRows, writeView,
} from './board/view.ts';
import type { AuthorsFilter, SortKey, View } from './board/view.ts';
import { AttentionBadge } from './components/cells/AttentionBadge.tsx';
import { CiCell } from './components/cells/CiCell.tsx';
import { CommentCell } from './components/cells/CommentCell.tsx';
import { ReviewCell } from './components/cells/ReviewCell.tsx';
import { Avatar } from './components/common/Avatar.tsx';
import { IssueLine } from './components/common/IssueLine.tsx';
import { LabelList } from './components/common/LabelList.tsx';
import { Person } from './components/common/Person.tsx';
import { Pill } from './components/common/Pill.tsx';
import { REPOSITORY } from './config.ts';
import { ApiContext, RulesContext } from './context.ts';
import { fetchOpenPullRequests } from './github/graphql.ts';
import { REST_URL } from './github/rest.ts';
import { useDismiss } from './hooks/useDismiss.ts';
import { usePopover } from './hooks/usePopover.ts';
import { useReportData } from './hooks/useReportData.ts';
import { AREAS } from './model/areas.ts';
import { derive } from './model/derive.ts';
import { DEFAULT_RULES, TITLE_TYPES } from './model/rules.ts';
import type { Rules } from './model/rules.ts';
import { parseQuery, SEARCH_QUALIFIERS, toggleLabelFilter } from './model/search.ts';
import { repositoryName } from './repository.ts';
import {
  DEFAULT_SETTINGS, DENSITIES, isValidStaleDays, loadSettings, MAX_STALE_DAYS, MIN_STALE_DAYS, parseList,
  rulesAreDefault, saveSettings, THEMES,
} from './settings.ts';
import type { Settings } from './settings.ts';
import type { AreaId, DerivedPullRequest, DevConfig, Label, Report } from './types.ts';

declare global {
  interface Window {
    PR_BOARD_DEV?: DevConfig;
  }
}

const TOKEN_HELP_URL = 'https://github.com/settings/personal-access-tokens/new';
const COPIED_FEEDBACK_MS = 1800;
const CLOCK_TICK_MS = 60 * 1000;

const RULES_POPOVER_PX = 440;
const UPDATE_POPOVER_PX = 280;

// Header cells stack above the rows from this layer up; see .col-resizer in styles.css.
const HEADER_LAYER = 2;

const DEV = window.PR_BOARD_DEV || null;

function Tiles({ base, active, setQuick }: { base: DerivedPullRequest[]; active: string[]; setQuick: (quick: string[]) => void }) {
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

function AuthorMenu({ authors, selected, mode, setAuthors }: {
  authors: AuthorEntry[];
  selected: Set<string>;
  mode: AuthorsFilter;
  setAuthors: (value: AuthorsFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, setOpen);

  const summary = authorsSummary(mode, selected);
  const toggle = (login: string) => setAuthors(toggleAuthor(login, selected, authors));
  const group = (title: string, list: AuthorEntry[]) => list.length ? (
    <>
      <div className="group">{title}</div>
      {list.map((a) => (
        <label key={a.login}>
          <input type="checkbox" id={'author-' + a.login} checked={selected.has(a.login)} onChange={() => toggle(a.login)} />
          <Avatar actor={a.actor} small />
          <span>{a.actor ? displayLogin(a.actor) : 'ghost'}</span>
          <span className="n">{a.count}</span>
        </label>
      ))}
    </>
  ) : null;

  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
        Authors: <strong>{summary}</strong> <span className="arrow" aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open ? (
        <div className="menu" role="group" aria-label="Authors">
          <div className="actions">
            <button type="button" className="btn" onClick={() => setAuthors(null)}>People</button>
            <button type="button" className="btn" onClick={() => setAuthors('bots')}>Bots</button>
            <button type="button" className="btn" onClick={() => setAuthors('all')}>Everyone</button>
            <button type="button" className="btn" onClick={() => setAuthors([])}>Clear</button>
          </div>
          {group('People', authors.filter((a) => !a.bot))}
          {group('Bots', authors.filter((a) => a.bot))}
        </div>
      ) : null}
    </div>
  );
}

// Where the data comes from and how old it is, behind a small status dot: green for live data, gray for the snapshot.
function UpdateInfo({ report, live, now }: { report: Report; live: boolean; now: number }) {
  const { open, position, ref, toggle } = usePopover(UPDATE_POPOVER_PX);
  const summary = (live ? 'Live data' : 'Hourly snapshot') + ', ' + formatAgo(report.generatedAt, now);
  return (
    <div className="update-info" ref={ref}>
      <button type="button" className={'btn ghost source-button' + (live ? ' live' : '')} aria-label={summary}
        title={summary} aria-expanded={open} onClick={toggle}>
        <span className="source-dot" aria-hidden="true"></span>
        <span className="source-age">{live ? 'live, ' : 'updated '}{formatAgo(report.generatedAt, now)}</span>
      </button>
      {open ? (
        <div className="popover" role="dialog" aria-label="Data source" style={position}>
          <strong className="popover-title">{live ? 'Live data' : 'Hourly snapshot'}</strong>
          <p className="muted">
            {live ? 'Loaded from GitHub with your token ' : 'Published by the scheduled workflow '}
            {formatAgo(report.generatedAt, now)}, at {new Date(report.generatedAt).toLocaleString()}.
          </p>
          {live ? null : <p className="muted">Refresh loads live data from GitHub.</p>}
          {report.runUrl ? <a className="popover-footer" href={report.runUrl} target="_blank" rel="noopener">Workflow run</a> : null}
        </div>
      ) : null}
    </div>
  );
}

function CopyLink() {
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

function RefreshControl({ token, setToken, refreshing, onRefresh, settings, onSettingsChange, canResetWidths, onResetWidths }: {
  token: string;
  setToken: (value: string) => void;
  refreshing: boolean;
  onRefresh: (token: string) => void;
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
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
          onRefresh={(value) => { setOpen(false); onRefresh(value); }} canResetWidths={canResetWidths} onResetWidths={onResetWidths} />
      ) : null}
    </div>
  );
}

function SettingsPanel({ settings, onChange, token, setToken, refreshing, askForToken, onRefresh, canResetWidths, onResetWidths }: {
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

interface ResizeHandlers {
  onResize: (id: string, width: number) => void;
  onCommit: (id: string, width: number) => void;
  onReset: (id: string) => void;
}

function ColumnResizer({ col, width, onResize, onCommit, onReset }: { col: Column; width: number } & ResizeHandlers) {
  const onPointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const startX = event.clientX;
    handle.setPointerCapture(event.pointerId);
    let latest = width;
    const move = (e: globalThis.PointerEvent) => {
      latest = Math.max(MIN_COLUMN_PX, Math.round(width + e.clientX - startX));
      onResize(col.id, latest);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      onCommit(col.id, latest);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    const step = event.key === 'ArrowLeft' ? -RESIZE_STEP_PX : event.key === 'ArrowRight' ? RESIZE_STEP_PX : 0;
    if (!step) return;
    event.preventDefault();
    onCommit(col.id, Math.max(MIN_COLUMN_PX, width + step));
  };
  return (
    <span className="col-resizer" role="separator" aria-orientation="vertical" tabIndex={0}
      aria-label={'Resize the ' + col.label + ' column'} aria-valuenow={width} aria-valuemin={MIN_COLUMN_PX}
      title="Drag to resize. Double-click to reset."
      onPointerDown={onPointerDown} onKeyDown={onKeyDown} onClick={(e) => e.stopPropagation()}
      onDoubleClick={() => onReset(col.id)}></span>
  );
}

function HeaderCell({ col, index, view, onSort, width, resize }: {
  col: Column;
  index: number;
  view: View;
  onSort: (key: SortKey) => void;
  width: number;
  resize: ResizeHandlers;
}) {
  const resizer = <ColumnResizer col={col} width={width} {...resize} />;
  // Each cell sits above the next one, so its resize handle stays usable where it overlaps the neighbor.
  const style = { zIndex: HEADER_LAYER + COLUMNS.length - index };
  const sort = col.sort;
  if (!sort) {
    return <th className={col.cls} scope="col" title={col.hint || ''} style={style}><span>{col.label}</span>{resizer}</th>;
  }
  const active = view.sort === sort;
  const ariaSort = active ? (view.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th className={col.cls} scope="col" aria-sort={ariaSort} title={col.hint || ''} style={style}>
      <button type="button" onClick={() => onSort(sort)}>
        {col.label}
        <span className="arrow" aria-hidden="true">{active ? (view.dir === 'asc' ? '▲' : '▼') : ''}</span>
      </button>
      {resizer}
    </th>
  );
}

const SEARCH_EXAMPLES = ['label:bug -is:draft', 'reviewer:anna-dev review:none', 'area:fe ci:failing', 'label:"module:ui" is:stale', 'no:issue no:label'];

function SearchHelp({ onExample }: { onExample: (query: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, setOpen);
  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="btn icon-only" aria-label="Search syntax" aria-expanded={open} onClick={() => setOpen(!open)}>?</button>
      {open ? (
        <div className="menu search-help" role="dialog" aria-label="Search syntax">
          <strong>Search syntax</strong>
          <p>Words match the title, number, people, labels, branch, failed checks, issues, projects, comments, and attention reasons. Add qualifiers to narrow the list; a minus in front excludes.</p>
          <dl>
            {Object.entries(SEARCH_QUALIFIERS).map(([key, q]) => <div key={key}><dt><code>{key}:</code></dt><dd>{q.hint}</dd></div>)}
          </dl>
          <p>Examples:</p>
          <div className="examples">
            {SEARCH_EXAMPLES.map((q) => <button key={q} type="button" className="btn" onClick={() => { onExample(q); setOpen(false); }}><code>{q}</code></button>)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const Row = memo(function Row({ pr, now, columns, activeLabels, onToggleLabel }: {
  pr: DerivedPullRequest;
  now: number;
  columns: Column[];
  activeLabels: Set<string>;
  onToggleLabel: (name: string) => void;
}) {
  const cls = ['ci-' + pr.ci, pr.example ? 'example' : ''].join(' ').trim();
  const merge = MERGE[pr.mergeable];
  const link = (content: ReactNode) => <a href={pr.url} target="_blank" rel="noopener">{content}</a>;
  const cells: Record<string, ReactNode> = {
    number: <td key="number" className="c-num mono num">{link('#' + pr.number)}</td>,
    title: (
      <td key="title" className="c-title">
        <div className="pr-title">{link(pr.title)}</div>
        {(pr.draft || pr.base !== 'main' || pr.example || pr.labels.length) ? (
          <div className="sub">
            {pr.example ? <span className="chip example">example</span> : null}
            {pr.draft ? <span className="chip draft">Draft</span> : null}
            {pr.base !== 'main' ? <span className="chip branch" title="Target branch">→ {pr.base}</span> : null}
            <LabelList labels={pr.labels} activeLabels={activeLabels} onToggle={onToggleLabel} />
          </div>
        ) : null}
        <IssueLine pr={pr} />
        {pr.note ? <div className="note">{pr.note}</div> : null}
      </td>
    ),
    author: <td key="author" className="c-person"><Person actor={pr.author} /></td>,
    ci: <td key="ci" className="c-state"><CiCell pr={pr} /></td>,
    review: <td key="review" className="c-state"><ReviewCell pr={pr} now={now} /></td>,
    merge: <td key="merge" className="c-state"><Pill state={merge} /></td>,
    age: (
      <td key="age" className="c-age">
        <div className={'age' + (pr.stale ? ' over' : '')}>{formatAge(pr.ageDays)}</div>
        <div className="activity" title={'Last updated ' + new Date(pr.updatedAt).toUTCString()}>updated {formatAgo(pr.updatedAt, now)}</div>
      </td>
    ),
    assignee: (
      <td key="assignee" className="c-person">
        {pr.assignees.length ? pr.assignees.map((a) => <Person key={a.login} actor={a} />)
          : <span className="dash">Unassigned</span>}
      </td>
    ),
    comment: <td key="comment" className="c-comment"><CommentCell pr={pr} now={now} /></td>,
    attention: (
      <td key="attention" className="c-attn">
        {pr.attention.length ? <AttentionBadge reasons={pr.attention} number={pr.number} /> : null}
      </td>
    ),
  };
  return <tr className={cls}>{columns.map((col) => cells[col.id])}</tr>;
});

function RulesButton() {
  const { open, position, ref, toggle } = usePopover(RULES_POPOVER_PX);
  const rules = useContext(RulesContext);
  const custom = !rulesAreDefault(rules);
  return (
    <div className="legend-rules" ref={ref}>
      {custom ? <span className="chip custom" title="Your attention rules differ from the team defaults. Change them in Settings.">Custom rules</span> : null}
      <button type="button" className="legend-link" aria-expanded={open} onClick={toggle}>Rules</button>
      {open ? (
        <div className="popover rules-popover" role="dialog" aria-label="Board rules" style={position}>
          <strong className="popover-title">Attention</strong>
          <ul>
            {rules.checkTitle ? <li>The title does not follow Conventional Commits, <code>type(scope): subject</code> with type {TITLE_TYPES.join(', ')}.</li> : null}
            <li>The PR is open for more than {rules.staleDays} days.</li>
            {rules.requireIssue ? <li>The PR has no linked issue (the Development field) and is not added to a GitHub Project.</li> : null}
          </ul>
          {custom ? (
            <p className="muted">These are your rules from Settings. The team defaults are {DEFAULT_RULES.staleDays} days, with the title and issue checks on.</p>
          ) : null}
          <strong className="popover-title">How states are read</strong>
          <ul>
            <li>CI uses the overall check status of the last commit.</li>
            <li>Review shows Changes requested if any reviewer's latest decision asks for changes. A comment-only review does not cancel an approval.</li>
            <li>Conflicts shows Checking while GitHub is still computing mergeability.</li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function LegendBar() {
  return (
    <footer className="legend-bar" aria-label="Legend">
      {LEGEND.map(([name, states]) => (
        <span key={name} className="legend-group">
          <span className="legend-name">{name}</span>
          {Object.values(states).map((st) => (
            <span key={st.label} className="legend-item">
              <span className={'pill short ' + st.tone}>{st.short}</span>{st.label}
            </span>
          ))}
          {states === REVIEW ? <span className="legend-item"><span className="pending">◷</span>pending reviewers</span> : null}
        </span>
      ))}
      <span className="legend-group">
        <span className="legend-name">Row</span>
        <span className="legend-item"><span className="stripe ci-failing"></span>CI failed</span>
        <span className="legend-item"><span className="stripe ci-running"></span>running</span>
        <span className="legend-item"><span className="stripe ci-passing"></span>passed</span>
      </span>
      <RulesButton />
    </footer>
  );
}

export function App() {
  const [data, setData] = useReportData();
  const [view, setView] = useState(readView);
  const [token, setTokenState] = useState(readToken);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const [settings, setSettingsState] = useState(loadSettings);
  const [savedWidths, setSavedWidths] = useState(readColumnWidths);
  const [dragWidths, setDragWidths] = useState<Widths | null>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  useEffect(() => {
    const wrap = tableWrapRef.current;
    if (!wrap) return undefined;
    const observer = new ResizeObserver(() => setAvailableWidth(wrap.clientWidth));
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => writeView(view), [view]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') delete root.dataset.theme; else root.dataset.theme = settings.theme;
    root.dataset.density = settings.density;
  }, [settings.theme, settings.density]);

  const setSettings = (next: Settings) => { saveSettings(next); setSettingsState(next); };
  const rules = settings.rules;
  const columns = useMemo(() => COLUMNS.filter((c) => c.required || !settings.hiddenColumns.includes(c.id)), [settings.hiddenColumns]);
  const patch = useCallback((changes: Partial<View>) => setView((prev) => ({ ...prev, ...changes })), []);
  const setToken = (value: string) => { storeToken(value); setTokenState(value); };

  const refresh = (withToken: string) => {
    setRefreshing(true);
    setRefreshError(null);
    // Skip the heavy parts of the query that only hidden columns would show.
    const parts = { checks: columns.some((c) => c.id === 'ci'), comments: columns.some((c) => c.id === 'comment') };
    const options = { token: withToken, repository: REPOSITORY, parts };
    fetchOpenPullRequests(DEV ? { ...options, endpoint: DEV.graphqlUrl } : options)
      .then((report) => {
        setData({ status: 'ready', report, source: 'live', error: null });
        setNow(Date.now());
      })
      .catch((error: Error) => setRefreshError(error.message))
      .finally(() => setRefreshing(false));
  };

  const prs = useMemo(() => {
    return (data.report ? data.report.prs : []).map((pr) => derive(pr, now, rules));
  }, [data.report, now, rules]);

  const authors = useMemo(() => collectAuthors(prs), [prs]);
  const selected = useMemo(() => selectedAuthors(view.authors, authors), [view.authors, authors]);

  const parsedQuery = useMemo(() => parseQuery(view.q), [view.q]);
  const activeLabels = useMemo(() => new Set(parsedQuery.filters
    .filter((f) => f.key === 'label' && !f.negate).map((f) => f.value)), [parsedQuery]);

  const base = useMemo(
    () => filterPullRequests(prs, { draft: view.draft, area: view.area }, selected, parsedQuery),
    [prs, selected, view.draft, view.area, parsedQuery],
  );

  const onToggleLabel = useCallback((name: string) => {
    setView((prev) => ({ ...prev, q: toggleLabelFilter(prev.q, name) }));
  }, []);

  const resizingId = dragWidths ? Object.keys(dragWidths)[0] : null;
  const widths = fitToWidth({ ...DEFAULT_WIDTHS, ...savedWidths, ...dragWidths }, availableWidth, resizingId, columns);
  const tableWidth = columns.reduce((sum, c) => sum + widths[c.id], 0);
  const commitWidths = (next: Widths) => {
    setSavedWidths(next);
    setDragWidths(null);
    writeColumnWidths(next);
  };
  const resize: ResizeHandlers = {
    onResize: (id, w) => setDragWidths({ [id]: w }),
    onCommit: (id, w) => {
      const next = { ...savedWidths, [id]: w };
      // Keep what the other flexible column showed during the drag, so nothing jumps on release.
      if (FLEX_COLUMNS.includes(id)) {
        const fitted = fitToWidth({ ...DEFAULT_WIDTHS, ...next }, availableWidth, id, columns);
        for (const other of FLEX_COLUMNS) if (other !== id) next[other] = fitted[other];
      }
      commitWidths(next);
    },
    onReset: (id) => {
      const next = { ...savedWidths };
      delete next[id];
      commitWidths(next);
    },
  };

  const rows = useMemo(
    () => visibleRows(base, { quick: view.quick, sort: view.sort, dir: view.dir }),
    [base, view.quick, view.sort, view.dir],
  );

  const onSort = (key: SortKey) => {
    if (view.sort === key) patch({ dir: view.dir === 'asc' ? 'desc' : 'asc' });
    else patch({ sort: key, dir: key === 'title' || key === 'author' ? 'asc' : 'desc' });
  };
  const resetView = () => setView({ ...DEFAULT_VIEW });
  const isDefault = JSON.stringify(view) === JSON.stringify(DEFAULT_VIEW);
  const report = data.report;

  const api = useMemo(() => ({ token, restUrl: DEV ? DEV.restUrl : REST_URL }), [token]);

  return (
    <ApiContext.Provider value={api}><RulesContext.Provider value={rules}>
      <header className="masthead">
        <h1><span className="repo">{report ? report.repo : repositoryName(REPOSITORY)}</span>Open pull requests</h1>
        <div className="masthead-side">
          <Tiles base={base} active={view.quick} setQuick={(quick) => patch({ quick })} />
          {report ? <UpdateInfo report={report} live={data.source === 'live'} now={now} /> : null}
          <RefreshControl token={token} setToken={setToken} refreshing={refreshing} onRefresh={refresh}
            settings={settings} onSettingsChange={setSettings}
            canResetWidths={Object.keys(savedWidths).length > 0} onResetWidths={() => commitWidths({})} />
        </div>
      </header>

      {refreshError ? <div className="banner bad" role="alert">Refresh failed. {refreshError}</div> : null}
      {data.status === 'error' ? (
        <div className="banner bad" role="alert">
          {data.error} The scheduled workflow may not have published data yet. Use Refresh with a token to load live data.
        </div>
      ) : null}
      {report && report.warnings.length ? <div className="banner warn">{report.warnings.map((w) => <div key={w}>{w}</div>)}</div> : null}

      <div className="toolbar">
        <label className="sr-only" htmlFor="pr-search">Search pull requests</label>
        <div className="search-box">
          <input id="pr-search" className="search" type="search" placeholder="Search, or filter: label:bug reviewer:anna-dev -is:draft"
            value={view.q} onChange={(e) => patch({ q: e.target.value })} />
          <SearchHelp onExample={(q) => patch({ q })} />
        </div>
        <AuthorMenu authors={authors} selected={selected} mode={view.authors} setAuthors={(value) => patch({ authors: value })} />
        <div className="segmented" role="group" aria-label="Draft status">
          {DRAFT_OPTIONS.map(([value, label]) =>
            <button key={value} type="button" aria-pressed={view.draft === value} onClick={() => patch({ draft: value })}>{label}</button>)}
        </div>
        <div className="segmented" role="group" aria-label="Area" title="Area comes from module labels, [FE]/[BE] tags, and frontend/ or backend/ paths">
          {AREA_OPTIONS.map(([value, label]) =>
            <button key={value} type="button" aria-pressed={view.area === value} onClick={() => patch({ area: value })}>{label}</button>)}
        </div>
        {isDefault ? null : <button type="button" className="btn ghost" onClick={resetView}>Reset view</button>}
        <CopyLink />
        <span className="result-count">{rows.length === 1 ? '1 pull request' : rows.length + ' pull requests'}</span>
      </div>

      <div className="table-wrap" ref={tableWrapRef}>
        <table className="board" style={{ width: tableWidth + 'px' }}>
          <colgroup>{columns.map((col) => <col key={col.id} style={{ width: widths[col.id] + 'px' }} />)}</colgroup>
          <thead><tr>{columns.map((col, index) => <HeaderCell key={col.id} col={col} index={index} view={view} onSort={onSort} width={widths[col.id]} resize={resize} />)}</tr></thead>
          <tbody>
            {data.status === 'loading' ? <tr><td colSpan={columns.length}><div className="empty">Loading pull requests…</div></td></tr>
              : rows.length ? rows.map((pr) => <Row key={pr.number} pr={pr} now={now} columns={columns} activeLabels={activeLabels} onToggleLabel={onToggleLabel} />)
                : (
                  <tr><td colSpan={columns.length}><div className="empty">
                    <strong>No pull requests match this view</strong>
                    <span>Try clearing the search or selecting more authors.</span>
                    <button type="button" className="btn" onClick={resetView}>Reset view</button>
                  </div></td></tr>
                )}
          </tbody>
        </table>
      </div>

      <LegendBar />
    </RulesContext.Provider></ApiContext.Provider>
  );
}
