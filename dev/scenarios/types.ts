// How mock scenarios answer the dev server.

// How the mock answers: an HTTP status and body, optionally after a delay, or a dropped connection.
export type MockResponse =
  | { status: number; body: string; delayMs?: number; destroy?: false }
  | { destroy: true; delayMs?: number };

export interface GraphqlVariables {
  owner: string;
  repo: string;
  first: number;
  after: string | null;
  // The @include switch of the project fields; only false leaves them out.
  withProjectFields?: boolean;
}

export interface ReportScenario {
  id: string;
  label: string;
  respond: (now: number) => MockResponse;
}

export interface RefreshScenario {
  id: string;
  label: string;
  respond: (variables: GraphqlVariables, now: number) => MockResponse;
}
