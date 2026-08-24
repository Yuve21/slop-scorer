/**
 * The repo artifact: everything the scanner observed about a checkout, and nothing else.
 *
 * Same two properties as the web artifact, for the same reasons.
 *
 * 1. EVERY OBSERVATION CARRIES A FILE AND A LINE. There is no field in here a finding could
 *    cite vaguely. "Comment density is high" is not a finding; "src/lib/cart.ts:41, the
 *    comment `// increment the counter` sits above `counter += 1`" is. The type makes the
 *    vague version impossible to express, which is cheaper than a review culture.
 * 2. THE ARTIFACT IS THE STORED THING, NOT THE REPO. A scan is re-scorable against a later
 *    corpus by replaying this object, with none of the storage cost or the licensing
 *    exposure of keeping a copy of somebody's source. Excerpts are capped at a line.
 */

import type { ProbeStatus } from "@slop/core";

export const REPO_ARTIFACT_SCHEMA_VERSION = 1 as const;

export type ProbeId =
  | "tree"
  | "source"
  | "comments"
  | "manifest"
  | "config"
  | "readme"
  | "tests"
  | "history"
  | "agent-files";

/**
 * Coverage weights. Reading the source is worth more than listing the tree, and the git
 * history is worth the least because a shallow clone or a tarball legitimately has none.
 */
export const PROBE_WEIGHTS: Readonly<Record<ProbeId, number>> = {
  tree: 1,
  source: 4,
  comments: 3,
  manifest: 2,
  config: 1,
  readme: 1,
  tests: 2,
  history: 1,
  "agent-files": 2,
};

export interface FunctionRecord {
  readonly file: string;
  readonly name: string;
  readonly startLine: number;
  readonly lineCount: number;
}

export interface CommentRecord {
  readonly file: string;
  readonly line: number;
  readonly text: string;
  /**
   * True when the comment's words are a restatement of the identifiers on the next code
   * line. Computed by token overlap, never by a model.
   */
  readonly restatesNextLine: boolean;
  /**
   * True when the comment gives a REASON: a "because", a "otherwise", a tradeoff, a bug
   * reference, an issue link. This is the strongest human tell in the code corpus, because
   * it is knowledge that is not recoverable from the code.
   */
  readonly givesRationale: boolean;
}

export interface SourceFileRecord {
  readonly path: string;
  readonly ext: string;
  readonly bytes: number;
  readonly lines: number;
  readonly codeLines: number;
  readonly commentLines: number;
  readonly blankLines: number;
  /** Identifiers imported by this file, used to decide whether a dependency is dead weight. */
  readonly imports: readonly string[];
}

export interface PlaceholderRecord {
  readonly file: string;
  readonly line: number;
  readonly marker: string;
  readonly text: string;
}

export interface DuplicateBlock {
  readonly hash: string;
  readonly lineCount: number;
  readonly occurrences: readonly { readonly file: string; readonly startLine: number }[];
  readonly excerpt: string;
}

export interface AgentFileRecord {
  readonly path: string;
  readonly bytes: number;
  readonly tool: string;
  /** Whether the checkout also ignores it. An ignored-but-present file was not committed. */
  readonly gitIgnored: boolean;
  readonly excerpt: string;
}

export interface DependencyRecord {
  readonly name: string;
  readonly kind: "dependencies" | "devDependencies";
  /** Files that import it. Empty means nothing in the scanned tree uses it. */
  readonly importedBy: readonly string[];
}

export interface ConfigRecord {
  readonly path: string;
  readonly bytes: number;
  /** Set when the file is byte-identical (after whitespace normalisation) to a known scaffold stub. */
  readonly matchesScaffoldDefault: string | null;
  readonly excerpt: string;
}

export interface TestFileRecord {
  readonly path: string;
  readonly lines: number;
  /** Assertion call sites. A test file with zero of them asserts nothing. */
  readonly assertions: number;
  /** Assertions that can never fail: expect(true).toBe(true), assert(1 === 1). */
  readonly tautologies: readonly { readonly line: number; readonly text: string }[];
}

export interface CommitRecord {
  readonly sha: string;
  readonly authorEmail: string;
  readonly at: string;
  readonly subject: string;
  readonly bodyLines: number;
  readonly isMerge: boolean;
}

export interface ReadmeRecord {
  readonly path: string;
  readonly bytes: number;
  readonly lines: number;
  /** Verbatim scaffold sentences found, with the line they sit on. */
  readonly templateMarkers: readonly { readonly line: number; readonly marker: string; readonly text: string }[];
}

export interface RepoArtifact {
  readonly schemaVersion: typeof REPO_ARTIFACT_SCHEMA_VERSION;
  readonly root: string;
  readonly scannedAt: string;
  /** Glob-ish include patterns the caller supplied, echoed so coverage is interpretable. */
  readonly include: readonly string[];
  /** Files skipped for size or binary content. Named, so coverage is not silently overstated. */
  readonly skipped: readonly string[];

  readonly files: readonly SourceFileRecord[];
  readonly functions: readonly FunctionRecord[];
  readonly comments: readonly CommentRecord[];
  readonly placeholders: readonly PlaceholderRecord[];
  readonly duplicates: readonly DuplicateBlock[];
  readonly agentFiles: readonly AgentFileRecord[];
  readonly dependencies: readonly DependencyRecord[];
  readonly configs: readonly ConfigRecord[];
  readonly tests: readonly TestFileRecord[];
  readonly readme: ReadmeRecord | null;

  readonly history: {
    readonly available: boolean;
    readonly reason?: string;
    readonly commits: readonly CommitRecord[];
  };

  /** Signs a team works here: CODEOWNERS, PR templates, a changelog, real CI. */
  readonly collaboration: {
    readonly codeowners: boolean;
    readonly pullRequestTemplate: boolean;
    readonly changelogEntries: number;
    readonly ciWorkflows: readonly { readonly path: string; readonly steps: number }[];
  };

  readonly probes: readonly ProbeStatus[];
}

/**
 * A clean repo that NO rule fires on.
 *
 * Every fixture in the code corpus is a patch over this, which is what makes the mutation
 * meta-test meaningful: the mutated case differs from the positive case in exactly one
 * field, so a rule that still fires after the mutation is reading something it never
 * claimed to read. `corpus.test.ts` also scores this object directly and requires zero
 * findings, so a rule accidentally written to fire on ABSENCE announces itself immediately.
 */
export function neutralRepo(overrides: Partial<RepoArtifact> = {}): RepoArtifact {
  const files: SourceFileRecord[] = [
    src("src/pricing/ladder.ts", 214, 27, 11, ["./bands", "node:assert"]),
    src("src/pricing/bands.ts", 96, 9, 6, ["./ladder"]),
    src("src/ingest/csv-reader.ts", 331, 41, 22, ["node:fs", "./ladder"]),
    src("src/ingest/quirks.ts", 58, 19, 4, []),
    src("src/cli.ts", 142, 12, 9, ["./ingest/csv-reader", "commander"]),
  ];
  const base: RepoArtifact = {
    schemaVersion: REPO_ARTIFACT_SCHEMA_VERSION,
    root: "/repo",
    scannedAt: "2026-08-23T00:00:00.000Z",
    include: ["**/*"],
    skipped: [],
    files,
    // Varied on purpose. Uniform sizes are a tell, so the neutral case must not be uniform.
    functions: [
      fn("src/pricing/ladder.ts", "bandFor", 18, 42),
      fn("src/pricing/ladder.ts", "clampToLadder", 64, 7),
      fn("src/pricing/bands.ts", "isEdgeBand", 12, 4),
      fn("src/ingest/csv-reader.ts", "readRows", 30, 96),
      fn("src/ingest/csv-reader.ts", "coerce", 130, 23),
      fn("src/ingest/quirks.ts", "fixLeedsPostcodes", 8, 31),
      fn("src/cli.ts", "main", 20, 58),
    ],
    // Neither restating nor rationale-bearing. The neutral case must fire NOTHING, and
    // counter-evidence is a finding too: a base artifact that trips a counter would make
    // every mutation case measure the fixture instead of the rule.
    comments: [
      { file: "src/ingest/quirks.ts", line: 6, text: "Postcode handling.", restatesNextLine: false, givesRationale: false },
      { file: "src/pricing/ladder.ts", line: 16, text: "Band ladder.", restatesNextLine: false, givesRationale: false },
    ],
    placeholders: [],
    duplicates: [],
    agentFiles: [],
    dependencies: [
      { name: "commander", kind: "dependencies", importedBy: ["src/cli.ts"] },
      { name: "vitest", kind: "devDependencies", importedBy: ["test/ladder.test.ts"] },
    ],
    configs: [
      {
        path: "eslint.config.js",
        bytes: 2_140,
        matchesScaffoldDefault: null,
        excerpt: "rules: { 'no-restricted-imports': ['error', { paths: [{ name: 'node:fs', importNames: ['readFileSync'] }] }] }",
      },
    ],
    // One thin test file: enough that `verify.no-tests` and `verify.tautological-tests` stay
    // quiet, not enough that `counter.real-test-coverage` fires.
    tests: [{ path: "test/ladder.test.ts", lines: 40, assertions: 2, tautologies: [] }],
    readme: { path: "README.md", bytes: 3_800, lines: 92, templateMarkers: [] },
    // A short, recent history: too few commits for the history signals, too short a span for
    // the lived-in-history counter.
    history: { available: true, commits: shortHistory() },
    collaboration: { codeowners: false, pullRequestTemplate: false, changelogEntries: 0, ciWorkflows: [] },
    probes: allProbesRan(),
  };
  return { ...base, ...overrides };
}

function src(path: string, lines: number, commentLines: number, blankLines: number, imports: string[]): SourceFileRecord {
  return {
    path,
    ext: path.slice(path.lastIndexOf(".")),
    bytes: lines * 34,
    lines,
    codeLines: lines - commentLines - blankLines,
    commentLines,
    blankLines,
    imports,
  };
}

const fn = (file: string, name: string, startLine: number, lineCount: number): FunctionRecord => ({
  file,
  name,
  startLine,
  lineCount,
});

/** Four ordinary commits over three days. Too few and too short for any history rule. */
function shortHistory(): CommitRecord[] {
  const start = Date.parse("2026-08-18T09:14:00.000Z");
  return [
    ["a1b2c3d", 0, "Initial import of the 1998 price ladder"],
    ["b2c3d4e", 1, "Read the CSV in a stream"],
    ["c3d4e5f", 2, "Band ladder lookup"],
    ["d4e5f6a", 3, "Wire up the CLI"],
  ].map(([sha, day, subject]) => ({
    sha: sha as string,
    authorEmail: "ros@example.com",
    at: new Date(start + (day as number) * 86_400_000).toISOString(),
    subject: subject as string,
    bodyLines: 0,
    isMerge: false,
  }));
}

/**
 * A history a person produced: irregular gaps, two authors, a revert, a merge, and commit
 * bodies. Not part of the neutral case, because it is counter-evidence and the neutral case
 * must fire nothing. Exported for the counter rules' fixtures and for the calibration corpus.
 */
export function livedInHistory(): CommitRecord[] {
  const raw: [string, string, number, string, number, boolean][] = [
    ["a1b2c3d", "ros@example.com", 0, "Initial import of the 1998 price ladder", 0, false],
    ["b2c3d4e", "ros@example.com", 3, "LS postcodes: split on the sector, not the length", 6, false],
    ["c3d4e5f", "ros@example.com", 4, "Revert 'split on the sector' - breaks LS1 1AA", 3, false],
    ["d4e5f6a", "ros@example.com", 11, "Handle the 1AA case properly this time", 8, false],
    ["e5f6a7b", "dan@example.com", 12, "csv reader: stream instead of buffering the whole export", 4, false],
    ["f6a7b8c", "ros@example.com", 19, "Merge branch 'stream-csv'", 0, true],
    ["a7b8c9d", "dan@example.com", 33, "Bands are inclusive at the lower bound", 11, false],
    ["b8c9d0e", "ros@example.com", 47, "CI: run the ladder tests on 20 and 22", 0, false],
    ["c9d0e1f", "dan@example.com", 51, "Drop the unused date helper", 0, false],
    ["d0e1f2a", "ros@example.com", 78, "Cache the band lookup, the CSV import got slow", 7, false],
  ];
  const start = Date.parse("2026-04-02T09:14:00.000Z");
  return raw.map(([sha, authorEmail, day, subject, bodyLines, isMerge]) => ({
    sha,
    authorEmail,
    at: new Date(start + day * 86_400_000 + (day % 7) * 3_600_000).toISOString(),
    subject,
    bodyLines,
    isMerge,
  }));
}

/** Every probe ran and collected something. Denominators are what stop a vacuous pass. */
export function allProbesRan(): ProbeStatus[] {
  return [
    { id: "tree", ran: true, denominator: 5, expectsNonEmpty: true, weight: PROBE_WEIGHTS.tree, note: "files in the tree" },
    {
      id: "source",
      ran: true,
      denominator: 5,
      expectsNonEmpty: true,
      weight: PROBE_WEIGHTS.source,
      note: "source files parsed. Zero means the extension filter went stale and every rule about the code passed having read nothing.",
    },
    {
      id: "comments",
      ran: true,
      denominator: 2,
      expectsNonEmpty: true,
      weight: PROBE_WEIGHTS.comments,
      note: "comments extracted. Zero from a repo with source in it means the comment pattern broke, not that the code is uncommented.",
    },
    { id: "manifest", ran: true, denominator: 2, weight: PROBE_WEIGHTS.manifest, note: "declared dependencies" },
    { id: "config", ran: true, denominator: 1, weight: PROBE_WEIGHTS.config },
    { id: "readme", ran: true, denominator: 1, weight: PROBE_WEIGHTS.readme },
    { id: "tests", ran: true, denominator: 1, weight: PROBE_WEIGHTS.tests, note: "test files found" },
    { id: "history", ran: true, denominator: 4, weight: PROBE_WEIGHTS.history, note: "commits read" },
    {
      id: "agent-files",
      ran: true,
      denominator: 12,
      expectsNonEmpty: true,
      weight: PROBE_WEIGHTS["agent-files"],
      note: "agent-artifact paths probed. Zero means the path list is empty, and every 'no agent files here' conclusion below was reached without looking.",
    },
  ];
}
