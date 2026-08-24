/**
 * Phase-2 suppression: evidence that is about the detector rather than about the repository.
 *
 * WHY THIS EXISTS, WITH THE RECEIPT
 *
 * The first live self-scan of this repository returned `scaffold.placeholder-markers`, +26
 * points, citing eight lines. Every one of those lines was an entry in `PLACEHOLDER_PATTERNS`
 * itself: `{ re: /\bFIXME\b/, marker: "FIXME" }`. The rule was working perfectly. It had
 * simply read a table of placeholder patterns as a repository full of placeholders, because
 * a scanner that matches strings cannot tell a MENTION from a USE.
 *
 * That is not a quirk of this repository. It is a whole class:
 *
 *   - a rule's pattern table contains, by construction, one worked example of every string
 *     the rule looks for;
 *   - a rule's positive fixture contains, by construction, a worked example of the artifact
 *     the rule fires on;
 *   - a test fixture directory contains lorem ipsum because that is what fixtures are for.
 *
 * Every linter, test framework, moderation corpus, security scanner and detector on GitHub
 * trips this. Special-casing our own paths would be dishonest and would fix nothing for the
 * next repository. So the suppression is stated as a general property of the EVIDENCE:
 *
 *   Evidence drawn from a line that DEFINES the pattern that matched it, or from a file whose
 *   declared role is fixture data, is evidence about the tool, not about the codebase.
 *
 * THREE PROPERTIES THIS IMPLEMENTATION HOLDS TO
 *
 *  1. IT IS NEVER SILENT. A suppression appears in `warnings` naming the rule, the file, the
 *     count and the reason, and when the rule still fires the reason is appended to the
 *     finding's `falsePositiveNote`, which is the line the receipt prints as `caveat:`. A
 *     quiet suppressor is indistinguishable from a dead rule, which is the exact failure the
 *     rest of this codebase is built to make impossible.
 *  2. IT RESPECTS THRESHOLDS. Withdrawing evidence is not the same as deleting findings: the
 *     placeholder rule needs six hits, and if four of ten were the pattern table then the
 *     rule must be re-run against the pruned artifact and allowed to fall below its own
 *     floor. So suppression prunes the ARTIFACT and re-runs `detect`, rather than filtering
 *     the finding's evidence array afterwards.
 *  3. IT IS RECORDED AT SCAN TIME, APPLIED AT RULE TIME. `definesItsOwnPattern` and
 *     `SourceFileRecord.role` are observations, captured with everything else, so a replayed
 *     artifact suppresses exactly as the live scan did.
 */

import type { PlaceholderRecord, RepoArtifact } from "./artifact.js";

/** One withdrawn observation, kept so the reason can name what was withdrawn and from where. */
export interface RemovedRecord {
  readonly kind: "placeholder" | "comment" | "duplicate-occurrence";
  readonly file: string;
  readonly line: number;
  readonly detail: string;
}

export interface Suppressor {
  readonly id: string;
  readonly title: string;
  /** Return the artifact with the self-referential observations withdrawn. */
  prune(artifact: RepoArtifact): { readonly artifact: RepoArtifact; readonly removed: readonly RemovedRecord[] };
  /** The sentence printed on the receipt and in the warning. Must name the file and the count. */
  reason(removed: readonly RemovedRecord[]): string;
}

/** What a suppressor did to one rule. Produced by `analyzeRepoArtifact`, printed, never dropped. */
export interface SuppressionRecord {
  readonly ruleId: string;
  readonly suppressorId: string;
  readonly hitsBefore: number;
  readonly hitsAfter: number;
  readonly stillFires: boolean;
  readonly files: readonly string[];
  readonly reason: string;
}

const MIN_SELF_DEFINED_MARKERS = 3;

/**
 * Suppressor 1: the line that matched is the definition of the pattern that matched it.
 *
 * Two tiers, and the second is the "clustering" half of the rule. A single self-defining
 * line is withdrawn on its own merits. A file carrying three or more DISTINCT self-defined
 * markers is a pattern table, and in a pattern table the prose around the table talks about
 * the same markers ("// the two most common placeholders there are"), so hits for markers
 * that file defines are withdrawn too. Hits for markers it does NOT define stay: a pattern
 * table with a real unfinished TODO in it is still an unfinished TODO.
 */
export const selfDefiningPattern: Suppressor = {
  id: "suppress.self-defining-pattern",
  title: "The cited line defines the pattern that matched it",
  prune(artifact) {
    const selfDefinedByFile = new Map<string, Set<string>>();
    for (const p of artifact.placeholders) {
      if (!p.definesItsOwnPattern) continue;
      const set = selfDefinedByFile.get(p.file) ?? new Set<string>();
      set.add(p.marker);
      selfDefinedByFile.set(p.file, set);
    }
    const patternTables = new Set(
      [...selfDefinedByFile.entries()].filter(([, m]) => m.size >= MIN_SELF_DEFINED_MARKERS).map(([f]) => f),
    );

    const withdrawn = (p: PlaceholderRecord): boolean =>
      p.definesItsOwnPattern || (patternTables.has(p.file) && (selfDefinedByFile.get(p.file)?.has(p.marker) ?? false));

    const removed: RemovedRecord[] = artifact.placeholders.filter(withdrawn).map((p) => ({
      kind: "placeholder" as const,
      file: p.file,
      line: p.line,
      detail: p.marker,
    }));
    if (removed.length === 0) return { artifact, removed };
    return { artifact: { ...artifact, placeholders: artifact.placeholders.filter((p) => !withdrawn(p)) }, removed };
  },
  reason(removed) {
    const files = [...new Set(removed.map((r) => r.file))];
    const markers = [...new Set(removed.map((r) => r.detail))].slice(0, 4).join(", ");
    return (
      `${removed.length} match(es) were withdrawn as self-referential: the cited lines in ${files.join(", ")} are the ` +
      `DEFINITION of the patterns that matched them (${markers}), not uses of them. A pattern table lists one example of ` +
      `every string its rule looks for, so counting those examples would flag every detector, linter and moderation ` +
      `corpus ever written.`
    );
  },
};

/**
 * Suppressor 2: the observation came from a file whose role is fixture data.
 *
 * A fixture is an input to a test. A rule's own positive fixture is a worked example of the
 * thing the rule fires on, and a `testdata/` directory is full of deliberately broken input.
 * Neither is a statement about the shipped code. The role is decided by path convention at
 * scan time (`fixtures/`, `__fixtures__/`, `testdata/`, `__mocks__/`, `*.fixture.ts`), which
 * is a convention, not a judgement, and is recorded in the artifact so it can be argued with.
 *
 * The file records themselves are deliberately NOT removed: the uniformity and
 * verification-floor rules measure the shape of the tree, and a tree with fixtures in it is
 * the tree. Only the evidence-bearing observations inside those files are withdrawn.
 */
export const fixtureData: Suppressor = {
  id: "suppress.fixture-data",
  title: "The observation came from a test fixture, not from shipped source",
  prune(artifact) {
    const fixtures = new Set(artifact.files.filter((f) => f.role === "fixture-data").map((f) => f.path));
    if (fixtures.size === 0) return { artifact, removed: [] };

    const removed: RemovedRecord[] = [
      ...artifact.placeholders
        .filter((p) => fixtures.has(p.file))
        .map((p) => ({ kind: "placeholder" as const, file: p.file, line: p.line, detail: p.marker })),
      ...artifact.comments
        .filter((c) => fixtures.has(c.file) && c.restatesNextLine)
        .map((c) => ({ kind: "comment" as const, file: c.file, line: c.line, detail: c.text.slice(0, 60) })),
      ...artifact.duplicates.flatMap((d) =>
        d.occurrences
          .filter((o) => fixtures.has(o.file))
          .map((o) => ({ kind: "duplicate-occurrence" as const, file: o.file, line: o.startLine, detail: d.hash })),
      ),
    ];
    if (removed.length === 0) return { artifact, removed };

    const duplicates = artifact.duplicates
      .map((d) => ({ ...d, occurrences: d.occurrences.filter((o) => !fixtures.has(o.file)) }))
      .filter((d) => new Set(d.occurrences.map((o) => o.file)).size >= 3);

    return {
      artifact: {
        ...artifact,
        placeholders: artifact.placeholders.filter((p) => !fixtures.has(p.file)),
        comments: artifact.comments.filter((c) => !(fixtures.has(c.file) && c.restatesNextLine)),
        duplicates,
      },
      removed,
    };
  },
  reason(removed) {
    const files = [...new Set(removed.map((r) => r.file))].slice(0, 4);
    return (
      `${removed.length} observation(s) were withdrawn because they come from fixture data (${files.join(", ")}). ` +
      `A fixture is an input to a test: a rule's own positive fixture contains, by construction, a worked example of ` +
      `exactly what the rule looks for, and a testdata directory is deliberately full of broken input.`
    );
  },
};

/** The suppressors, in application order. Both are general; neither names this repository. */
export const CODE_SUPPRESSORS: readonly Suppressor[] = [selfDefiningPattern, fixtureData];

/** Apply every suppressor, keeping each one's withdrawn records so a reason can be attributed. */
export function pruneArtifact(
  artifact: RepoArtifact,
  suppressors: readonly Suppressor[] = CODE_SUPPRESSORS,
): { readonly artifact: RepoArtifact; readonly bySuppressor: ReadonlyMap<string, readonly RemovedRecord[]> } {
  let current = artifact;
  const bySuppressor = new Map<string, readonly RemovedRecord[]>();
  for (const s of suppressors) {
    const { artifact: next, removed } = s.prune(current);
    current = next;
    if (removed.length > 0) bySuppressor.set(s.id, removed);
  }
  return { artifact: current, bySuppressor };
}

/** Render the suppressions as text, for the warning block and for the MCP payload. */
export function formatSuppressions(records: readonly SuppressionRecord[]): string {
  if (records.length === 0) return "";
  return records
    .map(
      (r) =>
        `  [${r.suppressorId}] ${r.ruleId}: ${r.hitsBefore} match(es) -> ${r.hitsAfter}. ` +
        `${r.stillFires ? "The rule still fires on what is left." : "The rule no longer fires."} ${r.reason}`,
    )
    .join("\n");
}
