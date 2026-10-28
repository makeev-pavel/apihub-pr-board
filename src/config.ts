// Build-time configuration of the page. Vite replaces __PR_BOARD_REPO__ (see vite.config.ts).

import { parseRepositories } from './repository.ts';

declare const __PR_BOARD_REPO__: string;

export const REPOSITORIES = parseRepositories(__PR_BOARD_REPO__);
