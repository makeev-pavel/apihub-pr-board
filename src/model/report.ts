// Reads prs.json as the page receives it from the network.

import type { Report } from '../types.ts';

// prs.json comes from the network: check the parts the page cannot render without.
export function parseReport(value: unknown): Report {
  const report = value as Partial<Report> | null;
  if (!report || typeof report !== 'object' || !Array.isArray(report.prs)) {
    throw new Error('the file has no list of pull requests');
  }
  return {
    repo: typeof report.repo === 'string' ? report.repo : '',
    generatedAt: typeof report.generatedAt === 'string' ? report.generatedAt : new Date(0).toISOString(),
    runUrl: typeof report.runUrl === 'string' ? report.runUrl : null,
    warnings: Array.isArray(report.warnings) ? report.warnings.filter((w) => typeof w === 'string') : [],
    prs: report.prs,
  };
}
