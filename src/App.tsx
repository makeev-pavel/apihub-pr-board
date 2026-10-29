import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collectAuthors, selectedAuthors } from './board/authors.ts';
import { boardColumns, DEFAULT_WIDTHS, isColumnShown, REVIEWERS_LIST_WIDTHS } from './board/columns.ts';
import { repositoriesSummary } from './board/format.ts';
import { boardRepos, linkSettingsQuery, missingReposMessage } from './board/link.ts';
import { readToken, storeToken } from './board/storage.ts';
import {
  AREA_OPTIONS, collectPriorities, DEFAULT_VIEW, DRAFT_OPTIONS, filterPullRequests, firstDirection, readView, visibleRows, writeView,
} from './board/view.ts';
import type { SortKey, View } from './board/view.ts';
import { RefreshControl } from './components/header/RefreshControl.tsx';
import { LoadStatus } from './components/common/LoadStatus.tsx';
import type { LoadState } from './components/common/LoadStatus.tsx';
import { applyProgress, startProgress } from './board/progress.ts';
import { ViewerBadge } from './components/header/ViewerBadge.tsx';
import { TokenDialog } from './components/settings/TokenDialog.tsx';
import { Tiles } from './components/header/Tiles.tsx';
import { UpdateInfo } from './components/header/UpdateInfo.tsx';
import { LegendBar } from './components/legend/LegendBar.tsx';
import { HeaderCell } from './components/table/HeaderCell.tsx';
import { Row } from './components/table/Row.tsx';
import { TableMessage } from './components/table/TableMessage.tsx';
import { AuthorMenu } from './components/toolbar/AuthorMenu.tsx';
import { PriorityMenu } from './components/toolbar/PriorityMenu.tsx';
import { RepositoriesMenu } from './components/toolbar/RepositoriesMenu.tsx';
import { CopyLink } from './components/toolbar/CopyLink.tsx';
import { SearchHelp } from './components/toolbar/SearchHelp.tsx';
import { REPOSITORIES } from './config.ts';
import { ApiContext, NotesContext, RulesContext, ReviewViewContext } from './context.ts';
import { fetchOpenPullRequests } from './github/graphql.ts';
import type { RepositoryProgress } from './github/graphql.ts';
import { REST_URL } from './github/rest.ts';
import { useBoardSettings } from './hooks/useBoardSettings.ts';
import { AUTO_REFRESH_MS, LOAD_SUMMARY_MS } from './board/format.ts';
import { useAutoRefresh } from './hooks/useAutoRefresh.ts';
import { useColumnWidths } from './hooks/useColumnWidths.ts';
import { useNotes } from './hooks/useNotes.ts';
import { useNoteText } from './hooks/useNoteText.ts';
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
  // The live load under way, or the one that just finished (DATA-27).
  const [load, setLoad] = useState<LoadState | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const { settings, setSettings, link, setRepos } = useBoardSettings();
  const notesApi = useNotes();

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
  // Without a snapshot the repositories come only from the link or Settings, as on the published page (DATA-23).
  const wanted = link.repos;
  const notLoaded = data.noSnapshot && !report;
  const headerRepos = link.repos.length ? link.repos : notLoaded ? [] : dataRepos;
  const pending = notLoaded ? wanted : missing;
  const offeredColumns = useMemo(() => boardColumns(repos.length), [repos.length]);
  const columns = useMemo(() => offeredColumns.filter((c) => isColumnShown(c, settings.hiddenColumns)), [offeredColumns, settings.hiddenColumns]);
  const { tableWrapRef, widths, tableWidth, resize, canResetWidths, resetWidths } = useColumnWidths(columns, settings.reviewColumn === 'list' ? REVIEWERS_LIST_WIDTHS : DEFAULT_WIDTHS);
  const patch = useCallback((changes: Partial<View>) => setView((prev) => ({ ...prev, ...changes })), []);
  const onToggleLabel = useCallback((name: string) => {
    setView((prev) => ({ ...prev, q: toggleLabelFilter(prev.q, name) }));
  }, []);
  const setToken = (value: string) => { storeToken(value); setTokenState(value); };
  // The token dialog (SET-18). After Not now it does not open by itself again until the page reloads.
  const [askingToken, setAskingToken] = useState(false);
  const tokenDismissed = useRef(false);
  const closeTokenDialog = useCallback(() => { tokenDismissed.current = true; setAskingToken(false); }, []);

  const refresh = (withToken: string) => {
    // Refresh reads the repositories the address asks for, or else those on the page; the build's list only counts
    // before the data loads.
    const names = link.repos.length ? link.repos : report && report.repos.length ? report.repos : REPOSITORIES.map(repositoryName);
    if (!names.length) {
      setRefreshError('Choose the repositories to show in Settings first.');
      return;
    }
    setRefreshing(true);
    setRefreshError(null);
    const startedAt = Date.now();
    setLastAttempt(startedAt);
    setLoad({ startedAt, repos: startProgress(names) });
    const ours = (change: (prev: LoadState) => LoadState | null) => setLoad((prev) => (prev && prev.startedAt === startedAt ? change(prev) : prev));
    // Skip the heavy parts of the query that only hidden columns would show.
    const parts = { checks: columns.some((c) => c.id === 'ci'), comments: columns.some((c) => c.id === 'comment') };
    const options = {
      token: withToken, repositories: names.map(parseRepository), parts,
      onProgress: (event: RepositoryProgress) => ours((prev) => ({ ...prev, repos: applyProgress(prev.repos, event) })),
    };
    fetchOpenPullRequests(DEV ? { ...options, endpoint: DEV.graphqlUrl } : options)
      .then((report) => {
        setData((prev) => ({ ...prev, status: 'ready', report, source: 'live', error: null }));
        setNow(Date.now());
        ours((prev) => ({ ...prev, finished: { at: Date.now(), prs: report.prs.length, repos: report.repos.length } }));
      })
      .catch((error: Error) => {
        setRefreshError(error.message);
        ours(() => null);
      })
      .finally(() => setRefreshing(false));
  };

  // The summary of a finished load stays a few seconds, then goes.
  useEffect(() => {
    if (!load || !load.finished) return undefined;
    const timer = window.setTimeout(() => setLoad((prev) => (prev === load ? null : prev)), LOAD_SUMMARY_MS);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Without a snapshot the page loads live data itself, once for each set of repositories and token (DATA-23).
  const autoLoaded = useRef('');
  useEffect(() => {
    const key = wanted.join(',').toLowerCase() + '|' + token;
    if (!data.noSnapshot || !token || !wanted.length || refreshing || autoLoaded.current === key) return;
    autoLoaded.current = key;
    refresh(token);
  });
  // Live data loads again every 5 minutes while the tab is visible (DATA-24).
  useAutoRefresh(data.source === 'live' && !!token && !refreshing, lastAttempt, AUTO_REFRESH_MS, () => refresh(token));
  useEffect(() => {
    if (data.noSnapshot && !token && wanted.length && !tokenDismissed.current) setAskingToken(true);
  }, [data.noSnapshot, token, wanted.length]);

  const viewerActor = data.source === 'live' && report && report.viewer ? report.viewer : null;
  const viewer = viewerActor ? viewerActor.login : '';
  // Without a known viewer the Review requested filter has nobody to count for: it waits, kept in the address (FILTER-18).
  const activeQuick = useMemo(() => (viewer ? view.quick : view.quick.filter((id) => id !== 'mine')), [viewer, view.quick]);
  const derived = useMemo(() => {
    const shown = new Set(repos.map((repo) => repo.toLowerCase()));
    const inView = (report ? report.prs : []).filter((pr) => !link.repos.length || shown.has(pr.repo.toLowerCase()));
    return inView.map((pr) => derive(pr, now, rules, viewer));
  }, [report, repos, link.repos, now, rules, viewer]);
  const prs = useNoteText(derived, notesApi.notes);

  const authors = useMemo(() => collectAuthors(prs), [prs]);
  const priorities = useMemo(() => collectPriorities(prs), [prs]);
  const noPriority = useMemo(() => prs.filter((pr) => !pr.issues.some((issue) => issue.priority)).length, [prs]);
  const selected = useMemo(() => selectedAuthors(view.authors, authors), [view.authors, authors]);

  const parsedQuery = useMemo(() => parseQuery(view.q), [view.q]);
  const activeLabels = useMemo(() => activeLabelFilters(parsedQuery), [parsedQuery]);

  const base = useMemo(
    () => filterPullRequests(prs, { draft: view.draft, area: view.area, priority: view.priority }, selected, parsedQuery),
    [prs, selected, view.draft, view.area, view.priority, parsedQuery],
  );

  const rows = useMemo(
    () => visibleRows(base, { quick: activeQuick, sort: view.sort, dir: view.dir }),
    [base, activeQuick, view.sort, view.dir],
  );

  const onSort = (key: SortKey) => {
    if (view.sort === key) patch({ dir: view.dir === 'asc' ? 'desc' : 'asc' });
    else patch({ sort: key, dir: firstDirection(key) });
  };
  const resetView = () => setView({ ...DEFAULT_VIEW });
  const isDefault = JSON.stringify(view) === JSON.stringify(DEFAULT_VIEW);

  const api = useMemo(() => ({ token, restUrl: DEV ? DEV.restUrl : REST_URL }), [token]);
  const reviewView = useMemo(() => ({ list: settings.reviewColumn === 'list', viewer }), [settings.reviewColumn, viewer]);

  return (
    <ApiContext.Provider value={api}><RulesContext.Provider value={rules}><NotesContext.Provider value={notesApi}><ReviewViewContext.Provider value={reviewView}>
      <header className="masthead">
        <h1>
          <span className="repo" title={headerRepos.length > 2 ? headerRepos.join(', ') : undefined}>{repositoriesSummary(headerRepos)}</span>
          Open pull requests
        </h1>
        <div className="masthead-side">
          <Tiles base={base} active={activeQuick} viewer={viewer}
            setQuick={(quick) => patch({ quick: !viewer && view.quick.includes('mine') ? [...quick, 'mine'] : quick })} />
          {report ? <UpdateInfo report={report} live={data.source === 'live'} now={now} /> : null}
          <RefreshControl token={token} setToken={setToken} refreshing={refreshing} onRefresh={refresh} onAskToken={() => setAskingToken(true)}
            settings={settings} onSettingsChange={setSettings} columns={offeredColumns}
            repositories={{ requested: link.repos, available: dataRepos, onChange: setRepos }}
            canResetWidths={canResetWidths} onResetWidths={resetWidths} />
          {viewerActor ? <ViewerBadge viewer={viewerActor} /> : null}
        </div>
      </header>

      {refreshError ? <div className="banner bad" role="alert">Refresh failed. {refreshError}</div> : null}
      {data.status === 'error' ? (
        <div className="banner bad" role="alert">
          {data.error} Use Refresh with a token to load live data.
        </div>
      ) : null}
      {pending.length && (report || data.noSnapshot) && !refreshing ? (
        <div className="banner warn">
          {missingReposMessage(pending, !!token, notLoaded ? 'none' : data.source === 'live' ? 'live' : 'snapshot')}
          {token ? null : <button type="button" className="btn banner-action" onClick={() => setAskingToken(true)}>Add token</button>}
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
        {settings.repoGroups.length ? <RepositoriesMenu groups={settings.repoGroups} repos={link.repos} setRepos={setRepos} /> : null}
        <AuthorMenu authors={authors} selected={selected} mode={view.authors} setAuthors={(value) => patch({ authors: value })} />
        <div className="segmented" role="group" aria-label="Draft status">
          {DRAFT_OPTIONS.map(([value, label]) =>
            <button key={value} type="button" aria-pressed={view.draft === value} onClick={() => patch({ draft: value })}>{label}</button>)}
        </div>
        <div className="segmented" role="group" aria-label="Area" title="Area comes from module labels, [FE]/[BE] tags, and frontend/ or backend/ paths">
          {AREA_OPTIONS.map(([value, label]) =>
            <button key={value} type="button" aria-pressed={view.area === value} onClick={() => patch({ area: value })}>{label}</button>)}
        </div>
        {priorities.length || view.priority.length ? (
          <PriorityMenu priorities={priorities} noneCount={noPriority} selected={view.priority} setPriority={(priority) => patch({ priority })} />
        ) : null}
        {isDefault ? null : <button type="button" className="btn ghost" onClick={resetView}>Reset view</button>}
        <CopyLink />
        <span className="result-count">{rows.length === 1 ? '1 pull request' : rows.length + ' pull requests'}</span>
      </div>

      <div className="table-wrap" ref={tableWrapRef}>
        <table className="board" style={{ width: tableWidth + 'px' }}>
          <colgroup>{columns.map((col) => <col key={col.id} style={{ width: widths[col.id] + 'px' }} />)}</colgroup>
          <thead><tr>{columns.map((col, index) => <HeaderCell key={col.id} col={col} index={index} view={view} onSort={onSort} width={widths[col.id]} resize={resize} />)}</tr></thead>
          <tbody>
            {rows.length ? rows.map((pr) => <Row key={pullRequestKey(pr)} pr={pr} now={now} columns={columns} repos={repos} activeLabels={activeLabels} onToggleLabel={onToggleLabel} />)
              : <TableMessage colSpan={columns.length} onResetView={resetView} progress={load && !load.finished ? <LoadStatus load={load} /> : null}
                kind={data.status === 'loading' || refreshing ? 'loading'
                  : notLoaded ? (wanted.length ? 'not-loaded' : 'no-repos') : data.status === 'error' ? 'not-loaded' : 'no-match'} />}
          </tbody>
        </table>
      </div>

      {load && (rows.length || load.finished) ? <LoadStatus load={load} floating /> : null}
      <LegendBar />
      {askingToken ? (
        <TokenDialog onClose={closeTokenDialog}
          onSave={(value) => { setToken(value); setAskingToken(false); refresh(value); }} />
      ) : null}
    </ReviewViewContext.Provider></NotesContext.Provider></RulesContext.Provider></ApiContext.Provider>
  );
}
