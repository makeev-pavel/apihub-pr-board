import { useCallback, useEffect, useMemo, useState } from 'react';
import { collectAuthors, selectedAuthors } from './board/authors.ts';
import { boardColumns, isColumnShown } from './board/columns.ts';
import { repositoriesSummary } from './board/format.ts';
import { boardRepos, linkSettingsQuery, missingReposMessage } from './board/link.ts';
import { readToken, storeToken } from './board/storage.ts';
import {
  AREA_OPTIONS, DEFAULT_VIEW, DRAFT_OPTIONS, filterPullRequests, firstDirection, readView, visibleRows, writeView,
} from './board/view.ts';
import type { SortKey, View } from './board/view.ts';
import { RefreshControl } from './components/header/RefreshControl.tsx';
import { Tiles } from './components/header/Tiles.tsx';
import { UpdateInfo } from './components/header/UpdateInfo.tsx';
import { LegendBar } from './components/legend/LegendBar.tsx';
import { HeaderCell } from './components/table/HeaderCell.tsx';
import { Row } from './components/table/Row.tsx';
import { AuthorMenu } from './components/toolbar/AuthorMenu.tsx';
import { CopyLink } from './components/toolbar/CopyLink.tsx';
import { SearchHelp } from './components/toolbar/SearchHelp.tsx';
import { REPOSITORIES } from './config.ts';
import { ApiContext, RulesContext } from './context.ts';
import { fetchOpenPullRequests } from './github/graphql.ts';
import { REST_URL } from './github/rest.ts';
import { useBoardSettings } from './hooks/useBoardSettings.ts';
import { useColumnWidths } from './hooks/useColumnWidths.ts';
import { useReportData } from './hooks/useReportData.ts';
import { derive } from './model/derive.ts';
import { pullRequestKey } from './model/report.ts';
import { activeLabelFilters, parseQuery, toggleLabelFilter } from './model/search.ts';
import { parseRepository, repositoryName } from './repository.ts';
import type { DevConfig } from './types.ts';

declare global {
  interface Window {
    PR_BOARD_DEV?: DevConfig;
  }
}

const CLOCK_TICK_MS = 60 * 1000;

const DEV = window.PR_BOARD_DEV || null;

export function App() {
  const [data, setData] = useReportData();
  const report = data.report;
  const [view, setView] = useState(readView);
  const [token, setTokenState] = useState(readToken);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const { settings, setSettings, link, setRepos } = useBoardSettings();

  useEffect(() => writeView(view, linkSettingsQuery(link)), [view, link]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') delete root.dataset.theme; else root.dataset.theme = settings.theme;
    root.dataset.density = settings.density;
  }, [settings.theme, settings.density]);

  const rules = settings.rules;
  const dataRepos = useMemo(() => (report ? report.repos : REPOSITORIES.map(repositoryName)), [report]);
  // The address may narrow the board to some repositories, or ask for ones the data does not have.
  const { shown: repos, missing } = useMemo(() => boardRepos(dataRepos, link.repos), [dataRepos, link.repos]);
  const headerRepos = link.repos.length ? link.repos : dataRepos;
  const offeredColumns = useMemo(() => boardColumns(repos.length), [repos.length]);
  const columns = useMemo(() => offeredColumns.filter((c) => isColumnShown(c, settings.hiddenColumns)), [offeredColumns, settings.hiddenColumns]);
  const { tableWrapRef, widths, tableWidth, resize, canResetWidths, resetWidths } = useColumnWidths(columns);
  const patch = useCallback((changes: Partial<View>) => setView((prev) => ({ ...prev, ...changes })), []);
  const onToggleLabel = useCallback((name: string) => {
    setView((prev) => ({ ...prev, q: toggleLabelFilter(prev.q, name) }));
  }, []);
  const setToken = (value: string) => { storeToken(value); setTokenState(value); };

  const refresh = (withToken: string) => {
    setRefreshing(true);
    setRefreshError(null);
    // Skip the heavy parts of the query that only hidden columns would show.
    const parts = { checks: columns.some((c) => c.id === 'ci'), comments: columns.some((c) => c.id === 'comment') };
    // Refresh reads the repositories the address asks for, or else those on the page; the build's list only counts
    // before the data loads.
    const names = link.repos.length ? link.repos : report && report.repos.length ? report.repos : null;
    const repositories = names ? names.map(parseRepository) : REPOSITORIES;
    const options = { token: withToken, repositories, parts };
    fetchOpenPullRequests(DEV ? { ...options, endpoint: DEV.graphqlUrl } : options)
      .then((report) => {
        setData({ status: 'ready', report, source: 'live', error: null });
        setNow(Date.now());
      })
      .catch((error: Error) => setRefreshError(error.message))
      .finally(() => setRefreshing(false));
  };

  const prs = useMemo(() => {
    const shown = new Set(repos.map((repo) => repo.toLowerCase()));
    const inView = (report ? report.prs : []).filter((pr) => !link.repos.length || shown.has(pr.repo.toLowerCase()));
    return inView.map((pr) => derive(pr, now, rules));
  }, [report, repos, link.repos, now, rules]);

  const authors = useMemo(() => collectAuthors(prs), [prs]);
  const selected = useMemo(() => selectedAuthors(view.authors, authors), [view.authors, authors]);

  const parsedQuery = useMemo(() => parseQuery(view.q), [view.q]);
  const activeLabels = useMemo(() => activeLabelFilters(parsedQuery), [parsedQuery]);

  const base = useMemo(
    () => filterPullRequests(prs, { draft: view.draft, area: view.area }, selected, parsedQuery),
    [prs, selected, view.draft, view.area, parsedQuery],
  );

  const rows = useMemo(
    () => visibleRows(base, { quick: view.quick, sort: view.sort, dir: view.dir }),
    [base, view.quick, view.sort, view.dir],
  );

  const onSort = (key: SortKey) => {
    if (view.sort === key) patch({ dir: view.dir === 'asc' ? 'desc' : 'asc' });
    else patch({ sort: key, dir: firstDirection(key) });
  };
  const resetView = () => setView({ ...DEFAULT_VIEW });
  const isDefault = JSON.stringify(view) === JSON.stringify(DEFAULT_VIEW);

  const api = useMemo(() => ({ token, restUrl: DEV ? DEV.restUrl : REST_URL }), [token]);

  return (
    <ApiContext.Provider value={api}><RulesContext.Provider value={rules}>
      <header className="masthead">
        <h1>
          <span className="repo" title={headerRepos.length > 2 ? headerRepos.join(', ') : undefined}>{repositoriesSummary(headerRepos)}</span>
          Open pull requests
        </h1>
        <div className="masthead-side">
          <Tiles base={base} active={view.quick} setQuick={(quick) => patch({ quick })} />
          {report ? <UpdateInfo report={report} live={data.source === 'live'} now={now} /> : null}
          <RefreshControl token={token} setToken={setToken} refreshing={refreshing} onRefresh={refresh}
            settings={settings} onSettingsChange={setSettings} columns={offeredColumns}
            repositories={{ requested: link.repos, available: dataRepos, onChange: setRepos }}
            canResetWidths={canResetWidths} onResetWidths={resetWidths} />
        </div>
      </header>

      {refreshError ? <div className="banner bad" role="alert">Refresh failed. {refreshError}</div> : null}
      {data.status === 'error' ? (
        <div className="banner bad" role="alert">
          {data.error} The scheduled workflow may not have published data yet. Use Refresh with a token to load live data.
        </div>
      ) : null}
      {missing.length && report ? (
        <div className="banner warn">{missingReposMessage(missing, !!token, data.source === 'live')}</div>
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
              : rows.length ? rows.map((pr) => <Row key={pullRequestKey(pr)} pr={pr} now={now} columns={columns} repos={repos} activeLabels={activeLabels} onToggleLabel={onToggleLabel} />)
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
