import { ev, patch } from "../rule.js";
import type { CodeRule } from "../rule.js";

/**
 * Family: structural-uniformity.
 *
 * Machine-even shapes. Human code is lumpy: one function is 90 lines because the problem is
 * 90 lines long, and the one next to it is four. A generation pass tends to emit units of a
 * similar size because it is filling a slot, not solving a problem of a particular size.
 *
 * Capped low, because a strict linter with a max-lines rule, a formatter, and any
 * code-generation step in the build produce the same evenness for reasons that have nothing
 * to do with who wrote it. The duplicate-block rule is the strongest of the three because it
 * cites the same twelve lines in three places, which a reader can check instantly.
 */

/** Coefficient of variation. Scale-free, so it compares a repo of 20-line and 200-line units. */
function coefficientOfVariation(values: readonly number[]): number {
  if (values.length < 2) return Number.POSITIVE_INFINITY;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean <= 0) return Number.POSITIVE_INFINITY;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

export const UNIFORMITY_RULES: readonly CodeRule[] = [
  {
    id: "uniform.function-length",
    family: "structural-uniformity",
    title: "Functions are all close to the same length",
    polarity: "signal",
    severity: "medium",
    baseWeight: 0.7,
    maxHits: 1,
    requiresProbe: "source",
    phase: 1,
    since: "code-corpus-2026.09",
    explanation:
      "Twenty or more functions with a coefficient of variation in length below 0.25. Real problems are not the same size as each other, so real functions are not either.",
    falsePositiveNote:
      "A max-lines lint rule, a handler-per-route architecture, generated clients and a strict style guide all flatten this distribution legitimately. It is a shape observation, not an authorship one.",
    prevention: "Nothing to fix here directly. If this is the only thing that fired, it is noise, and the family cap is set so it cannot carry a verdict.",
    detect: (a) => {
      const lengths = a.functions.map((f) => f.lineCount).filter((n) => n > 0);
      if (lengths.length < 20) return [];
      const cv = coefficientOfVariation(lengths);
      if (cv >= 0.25) return [];
      const mean = lengths.reduce((x, y) => x + y, 0) / lengths.length;
      return [
        ev("metric", `${lengths.length} functions across ${new Set(a.functions.map((f) => f.file)).size} files`, `mean ${mean.toFixed(1)} lines, coefficient of variation ${cv.toFixed(3)}`, {
          expected: "coefficient of variation at or above 0.25",
        }),
      ];
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          functions: Array.from({ length: 24 }, (_, i) => ({
            file: `src/handlers/h${i}.ts`,
            name: `handle${i}`,
            startLine: 8,
            lineCount: 22 + (i % 3),
          })),
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          functions: Array.from({ length: 24 }, (_, i) => ({
            file: `src/handlers/h${i}.ts`,
            name: `handle${i}`,
            startLine: 8,
            lineCount: [4, 9, 84, 17, 130, 6, 41, 12][i % 8] ?? 20,
          })),
        }),
      }),
    },
  },
  {
    id: "uniform.duplicate-blocks",
    family: "structural-uniformity",
    title: "The same block of code repeated verbatim in several files",
    polarity: "signal",
    severity: "high",
    baseWeight: 0.9,
    maxHits: 4,
    requiresProbe: "source",
    phase: 1,
    since: "code-corpus-2026.09",
    explanation:
      "A block of twelve or more normalised lines appears identically in three or more files. Copying is human too, but a copy in three places that nobody extracted is what happens when each file was produced in isolation without a view of the others.",
    falsePositiveNote:
      "Generated clients, migration files, test setup and framework-mandated boilerplate are legitimately identical. Deduplicating them would be a worse codebase, not a better one.",
    prevention: "Extract it once. If it cannot be extracted because the framework demands the shape, that is worth a comment saying so.",
    detect: (a) =>
      a.duplicates
        .filter((d) => d.occurrences.length >= 3 && d.lineCount >= 12)
        .slice(0, 4)
        .map((d) =>
          ev("line", d.occurrences.map((o) => `${o.file}:${o.startLine}`).join(", "), `${d.lineCount} identical lines in ${d.occurrences.length} files`, {
            expected: "one definition",
            excerpt: d.excerpt.slice(0, 200),
          }),
        ),
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          duplicates: [
            {
              hash: "9f2c1a",
              lineCount: 18,
              occurrences: [
                { file: "src/routes/users.ts", startLine: 12 },
                { file: "src/routes/orders.ts", startLine: 12 },
                { file: "src/routes/items.ts", startLine: 12 },
              ],
              excerpt: "try { const body = await req.json(); } catch { return new Response('bad request', { status: 400 }); }",
            },
          ],
        }),
      }),
      mutated: (base) => ({ artifact: patch(base, { duplicates: [] }) }),
      extra: [
        {
          name: "the same block in only two files does not fire",
          shouldFire: false,
          build: (base) => ({
            artifact: patch(base, {
              duplicates: [
                {
                  hash: "9f2c1a",
                  lineCount: 18,
                  occurrences: [
                    { file: "src/routes/users.ts", startLine: 12 },
                    { file: "src/routes/orders.ts", startLine: 12 },
                  ],
                  excerpt: "try { const body = await req.json(); } catch { return new Response('bad request', { status: 400 }); }",
                },
              ],
            }),
          }),
        },
      ],
    },
  },
  {
    id: "uniform.file-length",
    family: "structural-uniformity",
    title: "Source files are all close to the same length",
    polarity: "signal",
    severity: "low",
    baseWeight: 0.4,
    maxHits: 1,
    requiresProbe: "source",
    phase: 1,
    since: "code-corpus-2026.09",
    explanation:
      "Twelve or more source files with a coefficient of variation in length below 0.2. The same observation as function length, one level up.",
    falsePositiveNote: "A one-component-per-file or one-route-per-file convention produces this, and it is a good convention.",
    prevention: "Nothing to fix. Weighted near the floor and capped.",
    detect: (a) => {
      const lengths = a.files.map((f) => f.lines).filter((n) => n > 0);
      if (lengths.length < 12) return [];
      const cv = coefficientOfVariation(lengths);
      if (cv >= 0.2) return [];
      return [
        ev("metric", `${lengths.length} source files`, `coefficient of variation ${cv.toFixed(3)}`, {
          expected: "coefficient of variation at or above 0.2",
        }),
      ];
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          files: Array.from({ length: 14 }, (_, i) => ({
            path: `src/mod${i}.ts`,
            ext: ".ts",
            bytes: 4_000,
            lines: 118 + (i % 4),
            codeLines: 90,
            commentLines: 16,
            blankLines: 12,
            imports: ["./util"],
            role: "ordinary" as const,
          })),
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          files: Array.from({ length: 14 }, (_, i) => ({
            path: `src/mod${i}.ts`,
            ext: ".ts",
            bytes: 4_000,
            lines: [18, 240, 61, 700, 33, 129, 44][i % 7] ?? 100,
            codeLines: 90,
            commentLines: 6,
            blankLines: 4,
            imports: ["./util"],
            role: "ordinary" as const,
          })),
        }),
      }),
    },
  },
];
