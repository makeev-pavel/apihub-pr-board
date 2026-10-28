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
    fetch(DATA_URL, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(parseReport)
      .then((report) => setState({ status: 'ready', report, source: 'scheduled', error: null }))
      .catch((error: Error) => setState({ status: 'error', report: null, source: null, error: 'Cannot load ' + DATA_URL + ' (' + error.message + ').' }));
  }, []);
  return [state, setState] as const;
}
