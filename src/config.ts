// Build-time configuration of the page. Vite replaces __PR_BOARD_REPO__ (see vite.config.ts); the published page is
// built without it, so the list is empty and the repositories come from the link, Settings, or repository groups.

import { parseRepositories } from './repository.ts';

declare const __PR_BOARD_REPO__: string;

export const REPOSITORIES = __PR_BOARD_REPO__ ? parseRepositories(__PR_BOARD_REPO__) : [];
