import { ev, patch } from "../rule.js";
import type { CodeRule } from "../rule.js";

/**
 * Family: comment-boilerplate.
 *
 * The most characteristic code tell, and the one where the naive version does the most
 * damage. "Lots of comments" is not a signal: plenty of excellent codebases are heavily
 * commented, and some houses require it. What is a signal is a comment that carries NO
 * information the next line does not already carry, at volume.
 *
 * So the measurement is a ratio of restating comments to total comments, over a floor, and
 * the citation is always a specific comment on a specific line next to the code it restates.
 * A reader can disagree with the rule by looking at three lines.
 */

const restating = (file: string, line: number, text: string) => ({
  file,
  line,
  text,
  restatesNextLine: true,
  givesRationale: false,
});

export const COMMENT_RULES: readonly CodeRule[] = [
  {
    id: "comment.restates-the-code",
    family: "comment-boilerplate",
    title: "Comments that restate the line beneath them, at volume",
    polarity: "signal",
    severity: "high",
    baseWeight: 1.1,
    maxHits: 5,
    requiresProbe: "comments",
    phase: 1,
    since: "code-corpus-2026.09",
    explanation:
      "Half or more of the comments in this repository are a natural-language echo of the identifiers on the very next line, over a floor of eight comments. A comment that restates the code costs maintenance and carries nothing a reader could not get by reading one line down.",
    falsePositiveNote:
      "Teaching code, generated client SDKs, and some documentation-generation styles restate deliberately. Token overlap is a coarse instrument and it will call a well-named function's docstring a restatement.",
    prevention:
      "Comment the WHY. What was tried and rejected, which constraint forces this shape, which bug this line is load-bearing for. If a comment can be recovered from the code, delete it.",
    detect: (a) => {
      const total = a.comments.length;
      if (total < 8) return [];
      const restated = a.comments.filter((c) => c.restatesNextLine);
      if (restated.length / total < 0.5) return [];
      return restated
        .slice(0, 8)
        .map((c) =>
          ev("line", `${c.file}:${c.line}`, c.text.slice(0, 120), {
            expected: "a reason the next line is the way it is",
            excerpt: c.text.slice(0, 200),
          }),
        );
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          comments: [
            restating("src/cart.ts", 12, "Increment the counter"),
            restating("src/cart.ts", 18, "Loop through the items"),
            restating("src/cart.ts", 24, "Return the total"),
            restating("src/cart.ts", 31, "Check if the user is null"),
            restating("src/cart.ts", 40, "Set the value to true"),
            restating("src/cart.ts", 48, "Create a new array"),
            restating("src/cart.ts", 55, "Call the API"),
            restating("src/cart.ts", 62, "Handle the error"),
            restating("src/cart.ts", 70, "Export the function"),
          ],
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          comments: [
            restating("src/cart.ts", 12, "Increment the counter"),
            restating("src/cart.ts", 18, "Loop through the items"),
            restating("src/cart.ts", 24, "Return the total"),
            restating("src/cart.ts", 31, "Check if the user is null"),
            // Five rationale comments tip the ratio below half. One field changed.
            { file: "src/cart.ts", line: 40, text: "VAT is applied before the discount because HMRC treats the discount as a price adjustment, not a rebate.", restatesNextLine: false, givesRationale: true },
            { file: "src/cart.ts", line: 48, text: "Copying here rather than sorting in place: the caller reuses this array and we shipped that bug in March.", restatesNextLine: false, givesRationale: true },
            { file: "src/cart.ts", line: 55, text: "Retry twice, not three times. The upstream gateway rate-limits at three within a second.", restatesNextLine: false, givesRationale: true },
            { file: "src/cart.ts", line: 62, text: "Swallowing this one on purpose: a missing row here means the migration has not run yet and the caller handles it.", restatesNextLine: false, givesRationale: true },
            { file: "src/cart.ts", line: 70, text: "Exported only for the test. Do not use from application code, see issue 412.", restatesNextLine: false, givesRationale: true },
          ],
        }),
      }),
      extra: [
        {
          name: "a handful of restating comments is below the floor and does not fire",
          shouldFire: false,
          build: (base) => ({
            artifact: patch(base, {
              comments: [restating("src/cart.ts", 12, "Increment the counter"), restating("src/cart.ts", 18, "Loop through the items")],
            }),
          }),
        },
      ],
    },
  },
  {
    id: "comment.section-banner-density",
    family: "comment-boilerplate",
    title: "Every file opens with the same shape of banner comment",
    polarity: "signal",
    severity: "medium",
    baseWeight: 0.6,
    maxHits: 3,
    requiresProbe: "source",
    phase: 1,
    since: "code-corpus-2026.09",
    explanation:
      "Comment lines make up 30% or more of every source file in the repository, with almost no variation between files. Uniform commenting density across files of very different jobs is what a per-file generation pass produces; humans comment the hard file and leave the trivial one alone.",
    falsePositiveNote:
      "A house style with a mandatory file header produces exactly this, as does a codebase where the public API is documented per file. The measurement is the LACK OF VARIATION, which is coarse.",
    prevention: "Let the density follow the difficulty. The hard file earns paragraphs; the barrel file earns nothing.",
    detect: (a) => {
      const files = a.files.filter((f) => f.lines >= 40);
      if (files.length < 5) return [];
      const ratios = files.map((f) => f.commentLines / Math.max(1, f.lines));
      if (ratios.some((r) => r < 0.3)) return [];
      const mean = ratios.reduce((x, y) => x + y, 0) / ratios.length;
      const spread = Math.max(...ratios) - Math.min(...ratios);
      if (spread > 0.1) return [];
      return files
        .slice(0, 4)
        .map((f, i) =>
          ev("file", f.path, `${Math.round((ratios[i] ?? 0) * 100)}% comment lines`, {
            expected: `variation between files (this repo: mean ${Math.round(mean * 100)}%, spread ${Math.round(spread * 100)} points)`,
          }),
        );
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          files: base.files.map((f) => ({ ...f, lines: 120, commentLines: 42, blankLines: 12, codeLines: 66 })),
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          files: base.files.map((f, i) => ({
            ...f,
            lines: 120,
            commentLines: i === 0 ? 4 : 42,
            blankLines: 12,
            codeLines: i === 0 ? 104 : 66,
          })),
        }),
      }),
    },
  },
];
