// Loads prs.json once; Refresh replaces the data through the returned setter.

import { useEffect, useState } from 'react';
import { parseReport } from '../model/report.ts';
import type { Report } from '../types.ts';

const DATA_URL = 'prs.json';

interface ReportData {
  status: 'loading' | 'ready' | 'error';
  report: Report | null;
  source: 'scheduled' | 'live' | null;
  error: string | null;
}

export function useReportData() {
  const [state, setState] = useState<ReportData>({ status: 'loading', report: null, source: null, error: null });
  useEffect(() => {
    const controller = new AbortController();
    // A Refresh that finished first holds newer data, so a late snapshot or its error must not replace it.
    const unlessLive = (next: ReportData) => setState((prev) => (prev.source === 'live' ? prev : next));
    fetch(DATA_URL, { cache: 'no-store', signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(parseReport)
      .then((report) => unlessLive({ status: 'ready', report, source: 'scheduled', error: null }))
      .catch((error: Error) => {
        if (controller.signal.aborted) return;
        unlessLive({ status: 'error', report: null, source: null, error: 'Cannot load ' + DATA_URL + ' (' + error.message + ').' });
      });
    return () => controller.abort();
  }, []);
  return [state, setState] as const;
}
