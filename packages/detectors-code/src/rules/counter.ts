import { livedInHistory } from "../artifact.js";
import { ev, patch } from "../rule.js";
import type { CodeRule } from "../rule.js";

/**
 * Counter-evidence: the rules that argue FOR the repository.
 *
 * This layer is the difference between a corpus and a list of vibes. Finding tells is a
 * weekend. Knowing which tells lie, and what actively rebuts them, is the product. A
 * detector that can only find guilt finds it everywhere, and the failure that kills this
 * category is not a missed generator, it is a competent engineer being told a machine wrote
 * their code.
 *
 * All four of these are `global` counters: they argue with the whole verdict rather than
 * with one family, so they bypass family caps and are bounded by `globalCounterCap` instead.
 * Each one is chosen because it represents KNOWLEDGE THAT IS NOT RECOVERABLE FROM THE CODE
 * ITSELF, which is the honest definition of a human trace in a repository:
 *
 *   - a comment that says WHY, naming a constraint, a bug, or a rejected alternative
 *   - a history with reverts, merges, and commits that needed a paragraph
 *   - tests dense enough to actually fail
 *   - the apparatus of a team: CODEOWNERS, a PR template, a changelog, real CI
 */

export const CODE_COUNTER_RULES: readonly CodeRule[] = [
  {
    id: "counter.rationale-comments",
    family: "counter-evidence",
    title: "Comments that record a reason, not a restatement",
    polarity: "counter",
    counterScope: "global",
    severity: "info",
    baseWeight: -0.9,
    maxHits: 4,
    requiresProbe: "comments",
    phase: 1,
    since: "code-corpus-2026.09",
    explanation:
      "Comments that name a constraint, a rejected alternative, a bug, or an external decision. This is knowledge that cannot be recovered by reading the code, so somebody who knew something the code does not say has been here.",
    falsePositiveNote:
      "A rationale comment can be copied along with the code it explains, and an agent prompted to explain its reasoning will write plausible ones. The signal is real but it is not proof.",
    detect: (a) =>
      a.comments
        .filter((c) => c.givesRationale && !c.restatesNextLine)
        .slice(0, 4)
        .map((c) => ev("line", `${c.file}:${c.line}`, c.text.slice(0, 140), { excerpt: c.text.slice(0, 240) })),
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          comments: [
            {
              file: "src/vat.ts",
              line: 22,
              text: "VAT applies before the discount because HMRC treats the discount as a price adjustment, not a rebate. We had this the other way round until the 2025 audit.",
              restatesNextLine: false,
              givesRationale: true,
            },
          ],
        }),
      }),
      mutated: (base) => ({ artifact: patch(base, { comments: [] }) }),
    },
  },
  {
    id: "counter.lived-in-history",
    family: "counter-evidence",
    title: "A history with reverts, merges and explanations in it",
    polarity: "counter",
    counterScope: "global",
    severity: "info",
    baseWeight: -0.8,
    maxHits: 3,
    requiresProbe: "history",
    phase: 1,
    since: "code-corpus-2026.09",
    explanation:
      "The history contains a revert, a merge, or commits carrying a body, spread over more than a week. People change their minds, and the record of changing your mind is expensive to fabricate.",
    falsePositiveNote:
      "Automation produces merges, and a bot can write commit bodies. A long history also proves nothing about code added to it yesterday.",
    detect: (a) => {
      if (!a.history.available) return [];
      const c = a.history.commits;
      if (c.length < 5) return [];
      const ts = c.map((x) => Date.parse(x.at)).filter(Number.isFinite);
      const spanDays = ts.length >= 2 ? (Math.max(...ts) - Math.min(...ts)) / 86_400_000 : 0;
      if (spanDays < 7) return [];
      const out = [];
      const reverts = c.filter((x) => /^revert/i.test(x.subject));
      const merges = c.filter((x) => x.isMerge);
      const explained = c.filter((x) => x.bodyLines >= 3);
      if (reverts.length > 0) {
        out.push(ev("text", `${reverts[0]!.sha}`, reverts[0]!.subject, { excerpt: "a commit that undoes an earlier one" }));
      }
      if (merges.length > 0) out.push(ev("text", `${merges[0]!.sha}`, merges[0]!.subject, { excerpt: "a merge commit" }));
      if (explained.length >= 2) {
        out.push(
          ev("metric", `${explained.length} of ${c.length} commits`, `carry a message body, over ${spanDays.toFixed(0)} days`),
        );
      }
      return out;
    },
    fixtures: {
      positive: (base) => ({ artifact: patch(base, { history: { available: true, commits: livedInHistory() } }) }),
      // Same ten commits, one field changed: the span collapses from 78 days to 78 minutes.
      mutated: (base) => ({
        artifact: patch(base, {
          history: {
            available: true,
            commits: livedInHistory().map((c, i) => ({
              ...c,
              at: new Date(Date.parse("2026-04-02T09:14:00.000Z") + i * 8 * 60_000).toISOString(),
            })),
          },
        }),
      }),
    },
  },
  {
    id: "counter.real-test-coverage",
    family: "counter-evidence",
    title: "Tests dense enough to actually fail",
    polarity: "counter",
    counterScope: "global",
    severity: "info",
    baseWeight: -0.7,
    maxHits: 2,
    requiresProbe: "tests",
    phase: 1,
    since: "code-corpus-2026.09",
    explanation:
      "At least one test file per five source files, with three or more real assertions per test file and no tautologies. Somebody has run this and watched it go red.",
    falsePositiveNote: "Tests are as generatable as anything else, and assertion count is a coarse proxy for whether they check the right thing.",
    detect: (a) => {
      if (a.tests.length === 0 || a.files.length === 0) return [];
      const ratio = a.tests.length / a.files.length;
      const assertions = a.tests.reduce((x, t) => x + t.assertions, 0);
      const tautologies = a.tests.reduce((x, t) => x + t.tautologies.length, 0);
      if (ratio < 0.2 || assertions < a.tests.length * 3 || tautologies > 0) return [];
      return [
        ev("metric", `${a.tests.length} test files against ${a.files.length} source files`, `${assertions} assertions, 0 tautologies`),
      ];
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          tests: [
            { path: "test/ladder.test.ts", lines: 180, kind: "test" as const, assertions: 24, tautologies: [] },
            { path: "test/csv-reader.test.ts", lines: 96, kind: "test" as const, assertions: 11, tautologies: [] },
          ],
        }),
      }),
      // Same two dense test files, one field changed: one assertion that cannot fail.
      mutated: (base) => ({
        artifact: patch(base, {
          tests: [
            { path: "test/ladder.test.ts", lines: 180, kind: "test" as const, assertions: 24, tautologies: [{ line: 4, text: "expect(true).toBe(true)" }] },
            { path: "test/csv-reader.test.ts", lines: 96, kind: "test" as const, assertions: 11, tautologies: [] },
          ],
        }),
      }),
    },
  },
  {
    id: "counter.team-apparatus",
    family: "counter-evidence",
    title: "The apparatus of people working together",
    polarity: "counter",
    counterScope: "global",
    severity: "info",
    baseWeight: -0.6,
    maxHits: 3,
    requiresProbe: "tree",
    phase: 1,
    since: "code-corpus-2026.09",
    explanation:
      "CODEOWNERS, a pull-request template, a changelog with real entries, or a CI workflow with more than a couple of steps. These exist to coordinate humans and there is no reason to generate them into a repository nobody reviews.",
    falsePositiveNote: "All four ship in organisation templates and can be inherited without anyone reading them.",
    detect: (a) => {
      const out = [];
      if (a.collaboration.codeowners) out.push(ev("file", ".github/CODEOWNERS", "present"));
      if (a.collaboration.pullRequestTemplate) out.push(ev("file", ".github/pull_request_template.md", "present"));
      if (a.collaboration.changelogEntries >= 5) {
        out.push(ev("file", "CHANGELOG.md", `${a.collaboration.changelogEntries} entries`));
      }
      for (const w of a.collaboration.ciWorkflows.filter((x) => x.steps >= 4)) {
        out.push(ev("file", w.path, `${w.steps} steps`));
      }
      return out;
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          collaboration: {
            codeowners: true,
            pullRequestTemplate: true,
            changelogEntries: 14,
            ciWorkflows: [{ path: ".github/workflows/ci.yml", steps: 9 }],
          },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          collaboration: { codeowners: false, pullRequestTemplate: false, changelogEntries: 0, ciWorkflows: [] },
        }),
      }),
    },
  },
];
