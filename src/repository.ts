// The target repositories. They are configuration, not code: the build reads them from PR_BOARD_REPO, so nothing
// in git names the organization that owns them.

export const REPO_VARIABLE = 'PR_BOARD_REPO';
export const MAX_REPOSITORIES = 10;

export interface Repository {
  owner: string;
  name: string;
}

// GitHub owner and repository names: letters, digits, and dashes; repository names may also have dots and underscores.
const OWNER_AND_NAME = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/;

function matchRepository(value: string): RegExpExecArray | null {
  const match = OWNER_AND_NAME.exec(value);
  return match && match[2] !== '.' && match[2] !== '..' ? match : null;
}

// Repository names reach REST paths, so a name from prs.json is checked before use.
export function isRepositoryName(value: unknown): value is string {
  return typeof value === 'string' && matchRepository(value) !== null;
}

// An empty value counts as unset: CI passes an unset repository variable as an empty string.
export function parseRepository(value: string | undefined): Repository {
  if (!value) {
    throw new Error(REPO_VARIABLE + ' is not set. Set it to the repository as owner/name, such as acme/widgets.');
  }
  const match = matchRepository(value);
  if (!match) {
    throw new Error(REPO_VARIABLE + ' must be "owner/name", such as acme/widgets, not "' + value + '".');
  }
  return { owner: match[1], name: match[2] };
}

// A list separated by commas or spaces; a repeat counts once, whatever its case.
export function parseRepositories(value: string | undefined): Repository[] {
  const entries = (value || '').split(/[\s,]+/).filter(Boolean);
  if (!entries.length) return [parseRepository('')];
  const seen = new Set<string>();
  const repositories = entries.map(parseRepository).filter((repository) => {
    const key = repositoryName(repository).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (repositories.length > MAX_REPOSITORIES) {
    throw new Error(REPO_VARIABLE + ' lists ' + repositories.length + ' repositories; the board reads at most ' + MAX_REPOSITORIES + '.');
  }
  return repositories;
}

export function repositoryName(repository: Repository): string {
  return repository.owner + '/' + repository.name;
}
