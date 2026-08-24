import { describe, expect, it } from "vitest";
import { analyzeRepoArtifact, CODE_CONFIG, CODE_SUPPRESSORS, neutralRepo, pruneArtifact } from "@slop/detectors-code";
import type { PlaceholderRecord, RepoArtifact } from "@slop/detectors-code";
import { buildReport, formatReceipt } from "@slop/core";

/**
 * The phase-2 suppressor, tested against the case that produced it.
 *
 * Scanning this repository returned `scaffold.placeholder-markers`, +26 points, citing eight
 * lines of `PLACEHOLDER_PATTERNS` itself. Every assertion here is about the general property
 * that fixes that class, not about this repository: evidence drawn from a line that DEFINES
 * the pattern that matched it, or from a file whose declared role is fixture data, is evidence
 * about the detector rather than about the codebase under test.
 *
 * The last two tests are the ones that matter most. A suppressor that works silently is worse
 * than the false positive it removes, because a silently suppressed rule and a dead rule are
 * the same observation.
 */

const input = { kind: "repo", path: "/repo" } as const;

const placeholder = (over: Partial<PlaceholderRecord> = {}): PlaceholderRecord => ({
  file: "src/scan.ts",
  line: 100,
  marker: "FIXME",
  text: '{ re: /\\bFIXME\\b/, marker: "FIXME" },',
  definesItsOwnPattern: true,
  attributed: false,
  ...over,
});

/** A pattern table: eight markers, all of them defined by the line that matched. */
const patternTable = (): RepoArtifact =>
  neutralRepo({
    placeholders: [
      placeholder({ line: 100, marker: "your-api-key-here" }),
      placeholder({ line: 101, marker: "TODO: implement" }),
      placeholder({ line: 102, marker: "FIXME" }),
      placeholder({ line: 103, marker: "lorem ipsum" }),
      placeholder({ line: 104, marker: "replace-this" }),
      placeholder({ line: 105, marker: "ChangeMe" }),
      placeholder({ line: 106, marker: "coming soon" }),
      // Prose in the same file, ABOUT the markers the file defines. Withdrawn by the
      // clustering half of the rule: in a pattern table, the commentary is about the table.
      placeholder({ line: 240, marker: "FIXME", text: "// and `// FIXME` entirely: the two most common", definesItsOwnPattern: false }),
    ],
  });

describe("suppress.self-defining-pattern", () => {
  it("withdraws the pattern table and the rule falls below its own floor", () => {
    const before = analyzeRepoArtifact(patternTable(), input, { suppressors: [] });
    const after = analyzeRepoArtifact(patternTable(), input);
    expect(before.findings.map((f) => f.ruleId)).toContain("scaffold.placeholder-markers");
    expect(
      after.findings.map((f) => f.ruleId),
      "eight of eight matches were the pattern definitions, so the rule must not fire at all",
    ).not.toContain("scaffold.placeholder-markers");
  });

  it("keeps a real placeholder in a file that is not a pattern table", () => {
    const mixed = neutralRepo({
      placeholders: Array.from({ length: 7 }, (_, i) =>
        placeholder({ file: "src/config.ts", line: 10 + i, marker: "your-api-key-here", text: 'const k = "your-api-key-here";', definesItsOwnPattern: false }),
      ),
    });
    const result = analyzeRepoArtifact(mixed, input);
    expect(result.findings.map((f) => f.ruleId)).toContain("scaffold.placeholder-markers");
  });

  it("keeps a marker the pattern table does not define", () => {
    // A pattern table with a genuine unfinished job in it, for a marker it does NOT define.
    const withRealWork = neutralRepo({
      placeholders: [
        ...patternTable().placeholders.slice(0, 7),
        ...Array.from({ length: 6 }, (_, i) =>
          placeholder({
            file: "src/scan.ts",
            line: 300 + i,
            marker: "placeholder value",
            text: "const xxx_value = null; // never filled in",
            definesItsOwnPattern: false,
          }),
        ),
      ],
    });
    const pruned = pruneArtifact(withRealWork, CODE_SUPPRESSORS).artifact;
    expect(pruned.placeholders.map((p) => p.marker)).toEqual(Array.from({ length: 6 }, () => "placeholder value"));
    expect(analyzeRepoArtifact(withRealWork, input).findings.map((f) => f.ruleId)).toContain(
      "scaffold.placeholder-markers",
    );
  });
});

describe("suppress.fixture-data", () => {
  it("withdraws observations that come from a declared fixture path", () => {
    const withFixtures = neutralRepo({
      files: [
        ...neutralRepo().files,
        {
          path: "test/fixtures/pages.ts",
          ext: ".ts",
          bytes: 9_000,
          lines: 300,
          codeLines: 280,
          commentLines: 10,
          blankLines: 10,
          imports: [],
          role: "fixture-data",
        },
      ],
      placeholders: Array.from({ length: 7 }, (_, i) =>
        placeholder({
          file: "test/fixtures/pages.ts",
          line: 20 + i,
          marker: "lorem ipsum",
          text: 'const body = "Lorem ipsum dolor sit amet";',
          definesItsOwnPattern: false,
        }),
      ),
    });
    expect(analyzeRepoArtifact(withFixtures, input, { suppressors: [] }).findings.map((f) => f.ruleId)).toContain(
      "scaffold.placeholder-markers",
    );
    expect(
      analyzeRepoArtifact(withFixtures, input).findings.map((f) => f.ruleId),
      "lorem ipsum inside a fixture is the fixture doing its job",
    ).not.toContain("scaffold.placeholder-markers");
  });
});

describe("a suppression is never silent", () => {
  it("names the rule, the suppressor, the file and the reason in the warnings", () => {
    const result = analyzeRepoArtifact(patternTable(), input);
    const warning = (result.warnings ?? []).join("\n");
    expect(warning).toContain("suppression(s) applied");
    expect(warning).toContain("suppress.self-defining-pattern");
    expect(warning).toContain("scaffold.placeholder-markers");
    expect(warning).toContain("src/scan.ts");
    expect(warning, "the reason has to be a sentence, not a code").toContain("DEFINITION of the patterns");
    expect(warning).toContain("The rule no longer fires");
  });

  it("prints the reason on the receipt line when the rule still fires", () => {
    // Partial suppression: nine matches, three of them the pattern table's own entries. The
    // rule survives on the remaining six and the receipt has to say what was taken away.
    const partial = neutralRepo({
      placeholders: [
        placeholder({ line: 100, marker: "FIXME" }),
        placeholder({ line: 101, marker: "lorem ipsum" }),
        placeholder({ line: 102, marker: "ChangeMe" }),
        ...Array.from({ length: 6 }, (_, i) =>
          placeholder({
            file: "src/config.ts",
            line: 10 + i,
            marker: "your-api-key-here",
            text: 'const key = "your-api-key-here";',
            definesItsOwnPattern: false,
          }),
        ),
      ],
    });
    const result = analyzeRepoArtifact(partial, input);
    const finding = result.findings.find((f) => f.ruleId === "scaffold.placeholder-markers");
    expect(finding, "the rule must still fire on the six real placeholders").toBeTruthy();
    expect(finding?.evidence.every((e) => e.locator.startsWith("src/config.ts"))).toBe(true);
    expect(finding?.falsePositiveNote).toContain("Suppressed by suppress.self-defining-pattern");
    const receipt = formatReceipt(buildReport([result], { config: CODE_CONFIG }));
    expect(receipt, "the receipt prints the caveat, so the reason reaches the reader").toContain(
      "Suppressed by suppress.self-defining-pattern",
    );
  });

  it("leaves an artifact with nothing to suppress completely untouched", () => {
    const clean = neutralRepo();
    const withSuppressors = analyzeRepoArtifact(clean, input);
    const without = analyzeRepoArtifact(clean, input, { suppressors: [] });
    expect(withSuppressors.findings).toEqual(without.findings);
    expect(withSuppressors.warnings ?? []).toEqual(without.warnings ?? []);
  });
});
