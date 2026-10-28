// Matches the requirement ids in docs/requirements/ with the ids that test titles name, so a requirement without a
// test, or a test that names a removed requirement, fails the check.

// A requirement is defined where its bold id starts a bullet or a table row.
const DEFINITION = /^(?:- |\| )\*\*([A-Z]+-\d+)\*\*(.*)$/gm;
// Tests name ids at the start of their title: test('DATA-5 DATA-16: ...').
const TEST_TITLE = /\btest\(\s*['`]((?:[A-Z]+-\d+[ ,]*)+):/g;
const ID = /[A-Z]+-\d+/g;
const PLANNED = '*Planned';
const MANUAL = '*Manual check';

export interface RequirementCheck {
  covered: string[];
  // No test and not marked as planned or manual.
  missing: string[];
  planned: string[];
  manual: string[];
  unknown: { id: string; file: string }[];
}

// The definition line may continue on the next lines of the same bullet; markers are looked for up to the next one.
function definitions(text: string): Map<string, string> {
  const found = new Map<string, string>();
  const matches = [...text.matchAll(DEFINITION)];
  matches.forEach((match, i) => {
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    found.set(match[1], text.slice(match.index, end));
  });
  return found;
}

export function checkRequirements(specFiles: Record<string, string>, testFiles: Record<string, string>): RequirementCheck {
  const defined = new Map<string, string>();
  for (const text of Object.values(specFiles)) for (const [id, body] of definitions(text)) defined.set(id, body);
  const named = new Set<string>();
  const unknown: { id: string; file: string }[] = [];
  for (const [file, text] of Object.entries(testFiles)) {
    for (const title of text.matchAll(TEST_TITLE)) {
      for (const [id] of title[1].matchAll(ID)) {
        if (defined.has(id)) named.add(id);
        else unknown.push({ id, file });
      }
    }
  }
  const result: RequirementCheck = { covered: [], missing: [], planned: [], manual: [], unknown };
  const order = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });
  for (const [id, body] of [...defined].sort(([a], [b]) => order(a, b))) {
    if (named.has(id)) result.covered.push(id);
    else if (body.includes(PLANNED)) result.planned.push(id);
    else if (body.includes(MANUAL)) result.manual.push(id);
    else result.missing.push(id);
  }
  return result;
}
