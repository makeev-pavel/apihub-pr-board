// The target repository. It is configuration, not code: the build reads it from PR_BOARD_REPO, so nothing in git
// names the organization that owns it.

export const REPO_VARIABLE = 'PR_BOARD_REPO';

export interface Repository {
  owner: string;
  name: string;
}

// GitHub owner and repository names: letters, digits, and dashes; repository names may also have dots and underscores.
const OWNER_AND_NAME = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/;

// An empty value counts as unset: CI passes an unset repository variable as an empty string.
export function parseRepository(value: string | undefined): Repository {
  if (!value) {
    throw new Error(REPO_VARIABLE + ' is not set. Set it to the repository as owner/name, such as acme/widgets.');
  }
  const match = OWNER_AND_NAME.exec(value);
  if (!match || match[2] === '.' || match[2] === '..') {
    throw new Error(REPO_VARIABLE + ' must be "owner/name", such as acme/widgets, not "' + value + '".');
  }
  return { owner: match[1], name: match[2] };
}

export function repositoryName(repository: Repository): string {
  return repository.owner + '/' + repository.name;
}
