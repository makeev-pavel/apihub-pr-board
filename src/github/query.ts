// The GraphQL query for open pull requests and the sizes it asks for.

// GitHub stops a GraphQL query after about ten seconds, and PRs with long check lists make pages slow, so pages are
// small, and a page that times out is asked again with fewer PRs, down to MIN_PAGE_SIZE.
export const PAGE_SIZE = 20;
export const MIN_PAGE_SIZE = 5;
export const CHECKS_PAGE_SIZE = 100;

// More than RECENT_COMMENTS, so empty and marker-only comments do not hide older real ones.
export const COMMENTS_FETCHED = 5;

export const AVATAR_SIZE = 48;

// The GitHub Projects fields read from each linked issue (DATA-25), by name.
export const PROJECT_FIELDS = { priority: 'Priority', estimate: 'Estimate', sprint: 'Sprint' };
export const PROJECT_ITEMS = 3;

export const OPEN_PULL_REQUESTS_QUERY = `
query($owner: String!, $repo: String!, $first: Int!, $after: String, $avatarSize: Int!, $checksPageSize: Int!, $commentsFetched: Int!,
  $withChecks: Boolean!, $withComments: Boolean!, $withProjectFields: Boolean!, $projectItems: Int!, $priorityField: String!,
  $estimateField: String!, $sprintField: String!) {
  viewer { login }
  repository(owner: $owner, name: $repo) {
    pullRequests(states: OPEN, first: $first, after: $after, orderBy: {field: CREATED_AT, direction: DESC}) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        number
        title
        url
        isDraft
        createdAt
        updatedAt
        baseRefName
        mergeable
        author { __typename login avatarUrl(size: $avatarSize) }
        assignees(first: 10) { nodes { login avatarUrl(size: $avatarSize) } }
        labels(first: 30) { nodes { name color description } }
        reviewRequests(first: 20) {
          nodes {
            requestedReviewer {
              __typename
              ... on User { login avatarUrl(size: $avatarSize) }
              ... on Bot { login avatarUrl(size: $avatarSize) }
              ... on Team { name avatarUrl(size: $avatarSize) }
            }
          }
        }
        closingIssuesReferences(first: 10) {
          nodes {
            number title url issueType { name color } labels(first: 10) { nodes { name color description } }
            projectItems(first: $projectItems, includeArchived: false) @include(if: $withProjectFields) {
              nodes {
                priority: fieldValueByName(name: $priorityField) { ... on ProjectV2ItemFieldSingleSelectValue { name color } }
                estimate: fieldValueByName(name: $estimateField) { ... on ProjectV2ItemFieldNumberValue { number } }
                sprint: fieldValueByName(name: $sprintField) { ... on ProjectV2ItemFieldIterationValue { title startDate duration } }
              }
            }
          }
        }
        projectsV2(first: 10) { nodes { title } }
        latestOpinionatedReviews(first: 20) { nodes { state submittedAt author { __typename login avatarUrl(size: $avatarSize) } } }
        commits(last: 1) {
          nodes {
            commit {
              statusCheckRollup {
                state
                contexts(first: $checksPageSize) @include(if: $withChecks) {
                  totalCount
                  pageInfo { hasNextPage }
                  nodes {
                    __typename
                    ... on CheckRun { name conclusion detailsUrl checkSuite { workflowRun { workflow { name } } } }
                    ... on StatusContext { context state targetUrl description }
                  }
                }
              }
            }
          }
        }
        comments(last: $commentsFetched) @include(if: $withComments) { nodes { createdAt body url author { __typename login avatarUrl(size: $avatarSize) } } }
        reviews(last: 10) @include(if: $withComments) { nodes { submittedAt body url author { __typename login avatarUrl(size: $avatarSize) } } }
      }
    }
  }
}
`;

// The heaviest parts of the query, which a viewer can skip when the column that shows them is hidden.
export interface QueryParts {
  // Failed check details for the CI popover (up to CHECKS_PAGE_SIZE checks per PR).
  checks: boolean;
  // Comment and review bodies for the Last comment column.
  comments: boolean;
}

export const ALL_PARTS: QueryParts = { checks: true, comments: true };
