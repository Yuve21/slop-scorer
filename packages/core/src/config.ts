import type { FamilyId } from "./types.js";

/**
 * Rule families and their caps.
 *
 * A family is a group of CORRELATED signals. Eight shadcn tells are not eight independent
 * pieces of evidence, they are one observation seen eight ways, and summing them is how
 * every naive VibeScore clone ends up accusing a legitimate Tailwind site. So each family
 * is capped at a fixed share of the total logit budget and no family can carry a verdict
 * alone.
 *
 * The cap sizes encode judgements, not preferences:
 *
 *  - `builder-fingerprint` is the strongest signal and the most BRITTLE one. A generator
 *    vendor can delete its `<meta name="generator">` in one release. It is capped at 40%
 *    precisely because the score has to survive its disappearance.
 *  - `visual-default` carries the highest false-positive risk. Real designers converge.
 *  - `craft-floor` measures ABSENT CRAFT, not generation. A lazy human trips every one of
 *    these. It is deliberately the smallest positive family and the UI must say so.
 *  - `copy-tell` is cheap and noisy, so it is capped near nothing on purpose.
 *  - `provenance` can only ever be negative here. Signed and disclosed content is scored
 *    DOWN. Rewarding disclosure is the ethical posture and it is the one that survives EU
 *    AI Act Art. 50 and California SB 942.
 */
export interface FamilySpec {
  readonly id: FamilyId;
  readonly title: string;
  /** Share of `logitBudget` this family may contribute, in either direction. */
  readonly capShare: number;
  /** Ordering in the receipt, and the order used for sequential attribution. */
  readonly order: number;
  /** When true the family may only ever produce counter findings. */
  readonly counterOnly?: boolean;
  /** Shown verbatim in the report next to the family's findings. */
  readonly caveat: string;
}

export const WEB_FAMILIES: readonly FamilySpec[] = [
  {
    id: "builder-fingerprint",
    title: "Builder fingerprints",
    capShare: 0.4,
    order: 1,
    caveat:
      "The strongest signals here are also the easiest to delete. A vendor can strip a generator tag in one release, so this family is capped and the score has to stand up without it.",
  },
  {
    id: "visual-default",
    title: "Default visual language",
    capShare: 0.25,
    order: 2,
    caveat:
      "Highest false-positive risk in the corpus. Skilled human designers converge on the same defaults, so no single visual tell counts for much and several are suppressed when they stand alone.",
  },
  {
    id: "craft-floor",
    title: "Craft floor",
    capShare: 0.15,
    order: 3,
    caveat:
      "This family measures ABSENT CRAFT, not generation. A rushed human trips every check in it. Weighted lowest on purpose.",
  },
  {
    id: "structural-uniformity",
    title: "Structural uniformity",
    capShare: 0.1,
    order: 4,
    caveat: "Template-grade repetition. Also what a design system produces, which is why it is capped low.",
  },
  {
    id: "copy-tell",
    title: "Copy tells",
    capShare: 0.05,
    order: 5,
    caveat: "Cheap and noisy. Capped near zero deliberately: prose style is the weakest evidence available.",
  },
  {
    id: "provenance",
    title: "Provenance and disclosure",
    capShare: 0.08,
    order: 6,
    counterOnly: true,
    caveat: "Signed or disclosed content is scored DOWN. Disclosure is rewarded, never punished.",
  },
  {
    id: "counter-evidence",
    title: "Counter-evidence",
    capShare: 0.25,
    order: 7,
    counterOnly: true,
    caveat:
      "Signals that argue FOR the artifact. These bypass family caps because they argue with the whole verdict, and they carry a cap of their own so a single suppressor cannot clear a page either.",
  },
];

/**
 * The bands. There is deliberately no "inconclusive" band.
 *
 * Abstention is a STATUS (`AssessmentStatus`), not a rung on the ladder. Modelling it as a
 * band was the first version of this file and it was wrong: it let a caller sort by band and
 * put "we could not read the page" next to "few signals" as though they were neighbouring
 * amounts of the same thing. They are not the same kind of statement at all.
 */
export type Band = "few-signals" | "some-signals" | "many-signals" | "heavy-template-signature";

export interface ScoringConfig {
  readonly corpusVersion: string;
  readonly families: readonly FamilySpec[];
  /**
   * Prior probability that an arbitrary submitted artifact is generated, before any
   * evidence. Not 0.5: submissions are not a random sample of the web, and a 50-point
   * "score" for an artifact nothing fired on is a lie about what was observed.
   */
  readonly prior: number;
  /** Total log-odds a full-strength artifact may move. Family caps are shares of this. */
  readonly logitBudget: number;
  /** Cap on the magnitude of GLOBAL counter-evidence, which bypasses family caps. */
  readonly globalCounterCap: number;
  /** Below this coverage the score is withheld entirely. */
  readonly minCoverage: number;
  /** Fewer independent families than this and the score is withheld entirely. */
  readonly minFamiliesFired: number;
  /**
   * The families gate only applies to scores at or above this floor.
   *
   * A single family is a correlated observation, not corroboration, so a HIGH score built
   * on one family is not a finding and must be withheld. A LOW score on a fully covered
   * artifact is different: nothing much fired, we read the whole thing, and "few signals"
   * is the honest answer. Abstaining there would refuse to clear artifacts that deserve
   * clearing, which is its own kind of dishonesty.
   */
  readonly minFamiliesAppliesAtOrAbove: number;
  /** Score at or above this is the top band, but only if `topBandRequires` is satisfied. */
  readonly topBandFloor: number;
  readonly topBandRequires: {
    readonly families: number;
    /** At least one finding must come from one of these families. */
    readonly anyOfFamilies: readonly FamilyId[];
  };
  readonly bandFloors: {
    readonly some: number;
    readonly many: number;
  };
}

export const DEFAULT_CONFIG: ScoringConfig = {
  corpusVersion: "corpus-2026.09",
  families: WEB_FAMILIES,
  prior: 0.15,
  logitBudget: 8,
  globalCounterCap: 2,
  minCoverage: 0.6,
  minFamiliesFired: 2,
  minFamiliesAppliesAtOrAbove: 30,
  topBandFloor: 85,
  topBandRequires: { families: 3, anyOfFamilies: ["builder-fingerprint"] },
  bandFloors: { some: 30, many: 60 },
};

export const BAND_LABELS: Readonly<Record<Band, string>> = {
  "few-signals": "few known signals",
  "some-signals": "some known signals",
  "many-signals": "many known signals",
  "heavy-template-signature": "heavy template signature",
};

/**
 * Fixed framing language. A high score is a statement about an ARTIFACT resembling
 * generated-template output. It is not proof a tool made it and it is not a judgement of
 * the person who made it. This sentence rides on every report and is not configurable.
 */
export const REPORT_DISCLAIMER =
  "A high score means this artifact resembles generated-template output. It is not proof that a tool made it, and it is not a judgement of the person who made it.";
