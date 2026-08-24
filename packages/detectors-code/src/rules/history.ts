import { attachRemedies } from "@slop/core";
import { ev, patch } from "../rule.js";
import type { CodeRule } from "../rule.js";
import type { CommitRecord } from "../artifact.js";
import { manualOnce, NOTHING_TO_APPLY } from "./remedy.js";

/**
 * Family: history.
 *
 * The weakest positive family, and it is in the corpus mainly because the SHAPE of a
 * generated repository's history is so distinctive: thirty commits, one author, ninety
 * minutes, every message a tidy conventional-commit line with no body, no reverts, no
 * merges, nobody ever changing their mind.
 *
 * It is capped at 15% and can never anchor the top band, because the innocent explanations
 * are numerous and boring: a squash merge, an export, a tarball, a fresh monorepo split, a
 * first-day prototype, a repo whose real history lives somewhere else. A history probe that
 * cannot read git at all skips these rules entirely and lowers coverage, rather than
 * treating "no history" as a finding.
 */

const hours = (commits: readonly CommitRecord[]): number => {
  const ts = commits.map((c) => Date.parse(c.at)).filter((n) => Number.isFinite(n));
  if (ts.length < 2) return Number.POSITIVE_INFINITY;
  return (Math.max(...ts) - Math.min(...ts)) / 3_600_000;
};

const CONVENTIONAL = /^(feat|fix|chore|docs|refactor|test|style|perf|build|ci)(\([^)]+\))?!?:\s/;

const RAW_HISTORY_RULES: readonly CodeRule[] = [
  {
    id: "history.single-sitting",
    family: "history",
    title: "The entire history was written in one sitting by one author",
    polarity: "signal",
    severity: "medium",
    baseWeight: 0.7,
    maxHits: 1,
    requiresProbe: "history",
    phase: 1,
    since: "code-corpus-2026.09",
    explanation:
      "Twelve or more commits from a single author inside a two-hour window, with no merge and no revert. Software written by a person over time contains the person changing their mind.",
    falsePositiveNote:
      "A squashed import, a repository export, a migration from another host, a hackathon and a genuinely productive afternoon all produce this exactly. It is the weakest family in the corpus and it is capped so it cannot carry a verdict.",
    prevention: "Nothing to fix. If the history is short because the repo is new, that is the correct history.",
    detect: (a) => {
      const c = a.history.commits;
      if (!a.history.available || c.length < 12) return [];
      const authors = new Set(c.map((x) => x.authorEmail));
      if (authors.size > 1) return [];
      if (c.some((x) => x.isMerge || /^revert/i.test(x.subject))) return [];
      const span = hours(c);
      if (span > 2) return [];
      const sorted = [...c].sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
      return [
        ev(
          "metric",
          `${c.length} commits, ${[...authors][0]}`,
          `${span.toFixed(2)} hours from ${sorted[0]?.at} to ${sorted[sorted.length - 1]?.at}, no merges, no reverts`,
          { expected: "a history with more than one session in it" },
        ),
      ];
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          history: {
            available: true,
            commits: Array.from({ length: 14 }, (_, i) => ({
              sha: `aaa${i}`,
              authorEmail: "one@example.com",
              at: new Date(Date.parse("2026-08-01T10:00:00.000Z") + i * 6 * 60_000).toISOString(),
              subject: `feat: step ${i}`,
              bodyLines: 0,
              isMerge: false,
            })),
          },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          history: {
            available: true,
            commits: Array.from({ length: 14 }, (_, i) => ({
              sha: `aaa${i}`,
              authorEmail: "one@example.com",
              // One field changed: the commits are days apart instead of minutes.
              at: new Date(Date.parse("2026-08-01T10:00:00.000Z") + i * 86_400_000).toISOString(),
              subject: `feat: step ${i}`,
              bodyLines: 0,
              isMerge: false,
            })),
          },
        }),
      }),
    },
  },
  {
    id: "history.uniform-message-shape",
    family: "history",
    title: "Every commit message has the same generated shape",
    polarity: "signal",
    severity: "low",
    baseWeight: 0.4,
    maxHits: 1,
    requiresProbe: "history",
    phase: 1,
    since: "code-corpus-2026.09",
    explanation:
      "Ten or more commits, every single one a conventional-commit subject line with no body. Not that conventional commits are used, but that no commit in the entire history ever needed a paragraph.",
    falsePositiveNote:
      "Conventional commits are a widely adopted, genuinely useful convention, and commitlint enforces exactly this. Many good teams have long stretches of body-less commits.",
    prevention: "Nothing to fix. Weighted near the floor.",
    detect: (a) => {
      const c = a.history.commits;
      if (!a.history.available || c.length < 10) return [];
      if (!c.every((x) => CONVENTIONAL.test(x.subject) && x.bodyLines === 0)) return [];
      return [
        ev("metric", `${c.length} commit subjects`, "all conventional-commit prefixed, none with a body", {
          expected: "at least one commit that needed an explanation",
          excerpt: c.slice(0, 3).map((x) => x.subject).join(" | "),
        }),
      ];
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          history: {
            available: true,
            commits: Array.from({ length: 12 }, (_, i) => ({
              sha: `bbb${i}`,
              authorEmail: i % 2 ? "a@example.com" : "b@example.com",
              at: new Date(Date.parse("2026-05-01T10:00:00.000Z") + i * 86_400_000).toISOString(),
              subject: `chore: update thing ${i}`,
              bodyLines: 0,
              isMerge: false,
            })),
          },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          history: {
            available: true,
            commits: Array.from({ length: 12 }, (_, i) => ({
              sha: `bbb${i}`,
              authorEmail: i % 2 ? "a@example.com" : "b@example.com",
              at: new Date(Date.parse("2026-05-01T10:00:00.000Z") + i * 86_400_000).toISOString(),
              subject: `chore: update thing ${i}`,
              // One field changed: one commit needed an explanation.
              bodyLines: i === 3 ? 9 : 0,
              isMerge: false,
            })),
          },
        }),
      }),
    },
  },
];

/**
 * The fixes: neither of these has one, and proposing otherwise would be an instruction to
 * falsify a record. History is the one part of a repository that is supposed to be a fact
 * about the past. The family is capped at 15% for the same reason it has no patches: a
 * squashed import and an afternoon of real work are the same shape, and nothing an editor
 * does can tell them apart afterwards.
 */
export const HISTORY_RULES: readonly CodeRule[] = attachRemedies(RAW_HISTORY_RULES, {
  "history.single-sitting": (evidence) =>
    manualOnce(evidence, {
      locator: evidence[0]?.locator ?? "git history",
      summary: "Nothing to apply: a history is a record, not a thing to edit.",
      guidance: `${NOTHING_TO_APPLY} If the history is short because the repository is new, that is the correct history.`,
      doNotApplyIf: "always. Rewriting history to change this reading would be falsifying the record it reads.",
      blastRadius: "none",
    }),
  "history.uniform-message-shape": (evidence) =>
    manualOnce(evidence, {
      locator: evidence[0]?.locator ?? "git history",
      summary: "Nothing to apply: conventional commits are a convention, not a defect.",
      guidance: `${NOTHING_TO_APPLY} Write a body on the next commit that needs one; nothing about the existing ones should change.`,
      doNotApplyIf: "always. Rewriting past commit messages to change this reading would be falsifying the record it reads.",
      blastRadius: "none",
    }),
});
