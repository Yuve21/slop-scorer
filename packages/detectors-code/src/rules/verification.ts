import { ev, patch } from "../rule.js";
import type { CodeRule } from "../rule.js";

/**
 * Family: verification-floor.
 *
 * ABSENT VERIFICATION, not generated code. A person in a hurry trips every rule in this
 * family and a careful agent trips none of them, which is exactly why this family is the
 * smallest positive one in the corpus and why the UI has to say what it is measuring.
 *
 * It is in the corpus at all because the absence has a specific shape when nobody has ever
 * run the thing: a test file that exists and asserts nothing is a stronger observation than
 * no tests at all, because somebody produced the ceremony of a test without the substance.
 */

export const VERIFICATION_RULES: readonly CodeRule[] = [
  {
    id: "verify.no-tests",
    family: "verification-floor",
    title: "A substantial codebase with no test files",
    polarity: "signal",
    severity: "low",
    baseWeight: 0.4,
    maxHits: 1,
    requiresProbe: "tests",
    phase: 1,
    since: "code-corpus-2026.09",
    explanation:
      "Fifteen or more source files and no test file anywhere in the scanned tree. Nothing here has been shown to work by anything other than reading it.",
    falsePositiveNote:
      "Plenty of valuable, human-written code has no tests: scripts, prototypes, infrastructure glue, and anything whose tests live in a separate repository. If you narrowed the scan with a glob, the tests may simply be outside it.",
    prevention: "One test that would fail if the main path broke is worth more than a coverage number.",
    detect: (a) => {
      if (a.files.length < 15 || a.tests.length > 0) return [];
      return [
        ev("metric", `${a.files.length} source files, ${a.tests.length} test files`, "no test file in the scanned tree", {
          expected: "at least one test",
        }),
      ];
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          files: Array.from({ length: 18 }, (_, i) => ({
            path: `src/mod${i}.ts`,
            ext: ".ts",
            bytes: 3_000,
            lines: 60 + i * 7,
            codeLines: 50,
            commentLines: 6,
            blankLines: 4,
            imports: [],
          })),
          tests: [],
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          files: Array.from({ length: 18 }, (_, i) => ({
            path: `src/mod${i}.ts`,
            ext: ".ts",
            bytes: 3_000,
            lines: 60 + i * 7,
            codeLines: 50,
            commentLines: 6,
            blankLines: 4,
            imports: [],
          })),
          tests: [{ path: "test/mod.test.ts", lines: 80, assertions: 9, tautologies: [] }],
        }),
      }),
    },
  },
  {
    id: "verify.tautological-tests",
    family: "verification-floor",
    title: "Tests that cannot fail",
    polarity: "signal",
    severity: "high",
    baseWeight: 0.9,
    maxHits: 4,
    requiresProbe: "tests",
    phase: 1,
    since: "code-corpus-2026.09",
    explanation:
      "Assertions that are true regardless of the code: expect(true).toBe(true), assert(1 === 1), a test body with no assertion at all. A test that cannot fail is worse than no test, because it marks the area as covered.",
    falsePositiveNote:
      "A deliberate smoke test that only checks a module imports without throwing looks like this, and an assertion helper the scanner does not recognise reads as zero assertions.",
    prevention:
      "Mutation-test the test: break the code it covers and confirm it goes red. If it stays green, delete it or fix it.",
    detect: (a) => {
      const empty = a.tests.filter((t) => t.assertions === 0);
      const tauto = a.tests.flatMap((t) => t.tautologies.map((x) => ({ path: t.path, ...x })));
      return [
        ...tauto.slice(0, 4).map((t) => ev("line", `${t.path}:${t.line}`, t.text.slice(0, 120), { expected: "an assertion that can fail" })),
        ...empty.slice(0, 2).map((t) => ev("file", t.path, `${t.lines} lines, 0 assertions`, { expected: "at least one assertion" })),
      ];
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          tests: [
            {
              path: "test/cart.test.ts",
              lines: 30,
              assertions: 2,
              tautologies: [{ line: 12, text: "expect(true).toBe(true);" }],
            },
          ],
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, { tests: [{ path: "test/cart.test.ts", lines: 30, assertions: 2, tautologies: [] }] }),
      }),
    },
  },
];
