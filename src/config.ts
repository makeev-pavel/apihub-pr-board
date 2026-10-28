// Build-time configuration of the page. Vite replaces __PR_BOARD_REPO__ (see vite.config.ts).

import { parseRepository } from './repository.ts';

declare const __PR_BOARD_REPO__: string;

export const REPOSITORY = parseRepository(__PR_BOARD_REPO__);
