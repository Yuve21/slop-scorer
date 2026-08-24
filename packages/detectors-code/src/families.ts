import { DEFAULT_CONFIG } from "@slop/core";
import type { FamilySpec, ScoringConfig } from "@slop/core";

/**
 * Rule families for the code corpus, and their caps.
 *
 * A family groups CORRELATED signals. Eight scaffold tells are one observation seen eight
 * ways, and summing them is how a detector ends up telling a competent engineer their work
 * was written by a machine. Each family is capped at a share of the total logit budget and
 * none of them can carry a verdict alone.
 *
 * The cap sizes are judgements and each one has a reason:
 *
 *  - `agent-artifact` is the strongest and the most BRITTLE. A committed CLAUDE.md is close
 *    to dispositive about how the repo was worked on, and it is also one `git rm` away from
 *    gone. Capped at 35% so the corpus survives the day everyone learns to delete it.
 *  - `comment-boilerplate` is the most characteristic tell and the most contested. Some
 *    teams have a house style of heavy commenting. Capped in the middle.
 *  - `scaffold-residue` is strong per-item but shallow: it says a template was used, not
 *    that a machine wrote the code on top of it.
 *  - `structural-uniformity` is what a linter and a style guide also produce.
 *  - `verification-floor` measures ABSENT WORK, not generated work. A rushed human trips
 *    every check in it. Smallest positive family on purpose.
 *  - `history` is the weakest, because a squashed merge, an export, a tarball or a fresh
 *    monorepo split all destroy history for innocent reasons.
 *  - `counter-evidence` argues with the whole verdict, bypasses family caps, and carries a
 *    generous cap of its own. In a category whose failure mode is accusing careful people,
 *    the exonerating half deserves more room than any single accusing family.
 */
export const CODE_FAMILIES: readonly FamilySpec[] = [
  {
    id: "agent-artifact",
    title: "Agent working files",
    capShare: 0.35,
    order: 1,
    caveat:
      "The strongest signal here is also the easiest to delete, and committing an agent instruction file is a normal, sensible thing for a team that uses agents deliberately. It says how the repo was worked on, not who wrote which line.",
  },
  {
    id: "comment-boilerplate",
    title: "Comment boilerplate",
    capShare: 0.22,
    order: 2,
    caveat:
      "Some teams comment heavily by house style, and some codebases are taught with. The signal is comments that RESTATE the next line, not comments in general.",
  },
  {
    id: "scaffold-residue",
    title: "Scaffold residue",
    capShare: 0.2,
    order: 3,
    caveat:
      "Evidence that a template was used and not finished. Every project starts from a template; the tell is the parts nobody came back to.",
  },
  {
    id: "structural-uniformity",
    title: "Structural uniformity",
    capShare: 0.15,
    order: 4,
    caveat:
      "Machine-even function and file sizes. This is also what a strict linter, a formatter and a code-generation step produce, which is why it is capped low.",
  },
  {
    id: "verification-floor",
    title: "Verification floor",
    capShare: 0.12,
    order: 5,
    caveat:
      "This family measures ABSENT VERIFICATION, not generation. A rushed human trips every check in it. Weighted lowest of the positive families on purpose.",
  },
  {
    id: "history",
    title: "Commit history shape",
    capShare: 0.15,
    order: 6,
    caveat:
      "A squashed merge, a repo export, a tarball, a fresh monorepo split and a first-day prototype all produce a history that looks machine-made. Never sufficient on its own.",
  },
  {
    id: "counter-evidence",
    title: "Counter-evidence",
    capShare: 0.3,
    order: 7,
    counterOnly: true,
    caveat:
      "Signals that argue FOR the repository. These bypass family caps because they argue with the whole verdict, and carry a cap of their own so one suppressor cannot clear a repo either.",
  },
];

/**
 * The code scoring config.
 *
 * Two differences from the web config, both deliberate. The top band's anchor family is
 * `agent-artifact` rather than a builder fingerprint: nothing else in the code corpus is
 * strong enough to justify the top band, so "many small tells" cannot reach it. And
 * `minCoverage` is higher, at 0.65, because a partial repo read is much easier to get
 * (a glob that matches nothing, a monorepo package with no source) and much easier to
 * mistake for a clean repo.
 */
export const CODE_CONFIG: ScoringConfig = {
  ...DEFAULT_CONFIG,
  corpusVersion: "code-corpus-2026.09",
  families: CODE_FAMILIES,
  minCoverage: 0.65,
  topBandRequires: { families: 3, anyOfFamilies: ["agent-artifact"] },
};
