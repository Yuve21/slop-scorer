/**
 * The corpus training loop: what a scan is allowed to remember, and what a candidate rule must
 * carry before a person may argue for it.
 *
 * The runbook this implements is `docs/agents/HQ.md`, "Training the corpus". Five stages:
 * observation (here), candidate (here), review by corpus-steward AND false-positive-hunter,
 * promotion with a version bump, and the ratchet in `scripts/check-corpus-version.mjs`.
 *
 * ------------------------------------------------------------------------------------------------
 * PRIVACY IS A PRODUCT CLAIM, SO IT IS A TYPE CONSTRAINT
 *
 * This module exists to make the corpus better from real scans of private repositories on other
 * people's machines. That is the single most dangerous thing in this codebase, so:
 *
 *   - There is NO transport here and there is no code path to one. A sink takes an
 *     `ObservationWriter`, which receives a line of text. `@slop/core` imports no node builtin and
 *     no network API, and `scripts/check-no-egress.mjs` fails the build if that changes.
 *   - Projection is by ALLOWLIST, never by denylist. `observationFrom` constructs a new object
 *     field by field. A denylist ("strip these") fails OPEN for every field somebody adds later,
 *     and the field somebody adds later is always the one carrying the path.
 *   - Every rule id written is checked against the corpus that produced it. Rule ids are ours, so
 *     they are safe to keep; an id that is NOT in the corpus is a string of unknown provenance and
 *     `assertObservationCarriesNoContent` throws on it.
 *   - Everything else is bucketed. A file count becomes a bucket, a score becomes a bucket, a date
 *     becomes a day. An exact number is a correlation handle and there is no analysis here that
 *     needs one.
 *   - Off by default. A sink is constructed only when the host explicitly supplies a directory the
 *     user chose. There is no remote default to fall back to and no opt-out to forget, because
 *     there is nothing switched on to opt out of.
 * ------------------------------------------------------------------------------------------------
 */

import type { AssessmentStatus } from "./assessment.js";
import type { Band } from "./config.js";
import type { DetectorResult, FamilyId, Polarity } from "./types.js";
import { SlopError } from "./errors.js";

/** Bumped when the observation record's shape changes, so a reader can refuse an old line. */
export const OBSERVATION_SCHEMA_VERSION = 1;

export class ObservationLeakError extends SlopError {
  constructor(field: string, detail: string) {
    super(`Observation field "${field}" would leak content: ${detail}. Observations record SHAPE, never content.`);
    this.name = "ObservationLeakError";
  }
}

export class MalformedCandidateError extends SlopError {
  constructor(id: string, detail: string) {
    super(`Candidate rule "${id}" is not well formed: ${detail}`);
    this.name = "MalformedCandidateError";
  }
}

/* ------------------------------------------------------------------------------------------------
 * Stage 1: the observation
 * ---------------------------------------------------------------------------------------------- */

/**
 * A coarse description of what was scanned, carrying nothing that identifies it.
 *
 * The markers list is a CLOSED vocabulary (`SHAPE_MARKERS`) rather than free text, because free
 * text is where a path ends up. A caller that wants to record something not on the list has to add
 * it here, in the open, in a diff somebody reviews.
 */
export interface ShapeDigest {
  /** A bucket, never a count. */
  readonly sizeBucket: SizeBucket;
  /** Up to five file extensions by share, each share rounded to the nearest 0.1. */
  readonly extensions: readonly { readonly ext: string; readonly share: number }[];
  /** Markers from the closed vocabulary below. Booleans about the stack, not about the project. */
  readonly markers: readonly ShapeMarker[];
}

export type SizeBucket = "tiny" | "small" | "medium" | "large" | "huge";

export const SIZE_BUCKETS: readonly { readonly id: SizeBucket; readonly upTo: number }[] = [
  { id: "tiny", upTo: 10 },
  { id: "small", upTo: 100 },
  { id: "medium", upTo: 1_000 },
  { id: "large", upTo: 10_000 },
  { id: "huge", upTo: Number.POSITIVE_INFINITY },
];

export const bucketSize = (n: number): SizeBucket => (SIZE_BUCKETS.find((b) => n <= b.upTo) ?? SIZE_BUCKETS[SIZE_BUCKETS.length - 1]!).id;

/**
 * The closed marker vocabulary. Adding one is a deliberate act, reviewable in a diff.
 *
 * Nothing here names a project, a person, an organisation or a path. "uses-typescript" is a fact
 * about a stack shared by millions of repositories; "uses-@acme/internal-sdk" would be a fact about
 * one company, which is why a dependency NAME can never become a marker.
 */
export const SHAPE_MARKERS = [
  "has-typescript",
  "has-tests",
  "has-ci",
  "has-lockfile",
  "has-git-history",
  "has-monorepo-workspaces",
  "has-framework-config",
  "has-css-framework",
  "has-build-step",
  "is-single-page",
  "is-static-export",
  "renders-client-side",
] as const;

export type ShapeMarker = (typeof SHAPE_MARKERS)[number];

/** Score buckets. The exact score is deliberately not recorded; the band and the bucket are enough. */
export type ScoreBucket = "0-19" | "20-39" | "40-59" | "60-79" | "80-99";

export const bucketScore = (score: number): ScoreBucket => {
  const lo = Math.min(80, Math.floor(Math.max(0, Math.min(99, score)) / 20) * 20);
  return `${lo}-${lo + 19}` as ScoreBucket;
};

export interface CorpusObservation {
  readonly schemaVersion: number;
  /** The version the receipt cited. An observation is only comparable within a version. */
  readonly corpusVersion: string;
  readonly detectorId: string;
  readonly modality: string;
  /** Day granularity. A millisecond timestamp is a correlation handle and buys nothing. */
  readonly day: string;
  readonly status: AssessmentStatus;
  readonly band: Band | null;
  readonly scoreBucket: ScoreBucket | null;
  /** Rounded to two places. */
  readonly coverageRatio: number;
  readonly abstentionCodes: readonly string[];
  /**
   * The three sets that make an observation worth anything. What fired tells you a rule is alive;
   * what was evaluated and did NOT fire is what tells you a rule is DEAD, and that is the more
   * valuable of the two (see LEARNINGS L-05).
   */
  readonly rulesFired: readonly string[];
  readonly rulesEvaluatedNotFired: readonly string[];
  readonly probeDenominators: Readonly<Record<string, number>>;
  readonly shape: ShapeDigest;
}

/**
 * Build an observation from what a scan produced. Allowlist projection: every field is named.
 *
 * `knownRuleIds` is required, not optional. It is how the leak check can tell one of our rule ids
 * from an arbitrary string, and an optional safety argument is one nobody passes.
 */
export function observationFrom(input: {
  readonly results: readonly DetectorResult[];
  readonly report: {
    readonly corpusVersion: string;
    readonly status: AssessmentStatus;
    readonly band: Band | null;
    readonly score: number | null;
    readonly coverage: { readonly ratio: number; readonly probes: readonly { readonly id: string; readonly denominator?: number }[] };
    readonly abstention: readonly { readonly code: string }[];
  };
  readonly shape: ShapeDigest;
  readonly knownRuleIds: ReadonlySet<string>;
  /** Injected so a test is deterministic and so nobody reaches for a millisecond clock. */
  readonly now: Date;
}): CorpusObservation {
  const { results, report, shape, now } = input;

  const fired = new Set<string>();
  const evaluated = new Set<string>();
  for (const r of results) {
    for (const f of r.findings) fired.add(f.ruleId);
    for (const id of r.rulesEvaluated) evaluated.add(id);
  }

  const probeDenominators: Record<string, number> = {};
  for (const p of report.coverage.probes) probeDenominators[p.id] = p.denominator ?? 0;

  const observation: CorpusObservation = {
    schemaVersion: OBSERVATION_SCHEMA_VERSION,
    corpusVersion: report.corpusVersion,
    detectorId: results.map((r) => r.detectorId).sort().join("+"),
    modality: [...new Set(results.map((r) => r.modality))].sort().join("+"),
    day: now.toISOString().slice(0, 10),
    status: report.status,
    band: report.band,
    scoreBucket: report.score === null ? null : bucketScore(report.score),
    coverageRatio: Math.round(report.coverage.ratio * 100) / 100,
    abstentionCodes: [...new Set(report.abstention.map((a) => a.code))].sort(),
    rulesFired: [...fired].sort(),
    rulesEvaluatedNotFired: [...evaluated].filter((id) => !fired.has(id)).sort(),
    probeDenominators,
    shape: {
      sizeBucket: shape.sizeBucket,
      extensions: shape.extensions.slice(0, 5).map((e) => ({ ext: e.ext, share: Math.round(e.share * 10) / 10 })),
      markers: [...shape.markers].sort(),
    },
  };

  return assertObservationCarriesNoContent(observation, input.knownRuleIds);
}

/**
 * The guard. It runs on the way OUT, on the constructed record, not on the inputs, because the
 * thing that matters is what would be written to disk.
 *
 * It is deliberately paranoid about strings: any string in the record must either be a rule id the
 * corpus knows, a member of a closed vocabulary, or match a narrow safe shape. Anything else is
 * refused rather than sanitised, because a sanitiser that silently rewrites is a sanitiser nobody
 * checks.
 */
export function assertObservationCarriesNoContent(o: CorpusObservation, knownRuleIds: ReadonlySet<string>): CorpusObservation {
  // A path, a URL, an email or a Windows drive letter. If any of these can be spelled with the
  // characters a field permits, that field is too permissive.
  const LOOKS_LIKE_CONTENT = /[\\/]|@|:\/\/|\.\.|^[A-Za-z]:|~|\s/;

  const checkRuleIds = (field: string, ids: readonly string[]) => {
    for (const id of ids) {
      if (!knownRuleIds.has(id)) {
        throw new ObservationLeakError(field, `"${id}" is not a rule in the corpus that produced this observation, so its provenance is unknown`);
      }
    }
  };
  checkRuleIds("rulesFired", o.rulesFired);
  checkRuleIds("rulesEvaluatedNotFired", o.rulesEvaluatedNotFired);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.day)) throw new ObservationLeakError("day", "must be a bare YYYY-MM-DD date, never a timestamp");
  if (LOOKS_LIKE_CONTENT.test(o.corpusVersion)) throw new ObservationLeakError("corpusVersion", "contains a path, URL or whitespace character");
  for (const field of ["detectorId", "modality"] as const) {
    // These are joined with "+", which is why the separator is not in the pattern below.
    if (/[\\/]|@|:\/\/|\.\.|^[A-Za-z]:|~|\s/.test(o[field])) throw new ObservationLeakError(field, "contains a path, URL or whitespace character");
  }
  for (const m of o.shape.markers) {
    if (!(SHAPE_MARKERS as readonly string[]).includes(m)) throw new ObservationLeakError("shape.markers", `"${m}" is not in the closed marker vocabulary`);
  }
  for (const e of o.shape.extensions) {
    // An "extension" is the most tempting place to smuggle a name, so it is capped hard.
    if (!/^\.?[A-Za-z0-9]{1,10}$/.test(e.ext)) throw new ObservationLeakError("shape.extensions", `"${e.ext}" is not a bare file extension`);
  }
  for (const id of Object.keys(o.probeDenominators)) {
    if (LOOKS_LIKE_CONTENT.test(id)) throw new ObservationLeakError("probeDenominators", `probe id "${id}" contains a path, URL or whitespace character`);
  }
  for (const c of o.abstentionCodes) {
    if (!/^[a-z_]+$/.test(c)) throw new ObservationLeakError("abstentionCodes", `"${c}" is not a bare abstention code`);
  }
  return o;
}

/**
 * A sink writes one JSON object per line. The writer is INJECTED and receives text.
 *
 * There is no `url` here and no way to give it one. That is the whole design: the type cannot
 * express a network destination, so no future caller can quietly supply one.
 */
export interface ObservationWriter {
  append(line: string): void | Promise<void>;
}

export interface ObservationSink {
  record(o: CorpusObservation): void | Promise<void>;
}

export const jsonlLine = (o: CorpusObservation): string => JSON.stringify(o) + "\n";

export function observationSink(writer: ObservationWriter, knownRuleIds: ReadonlySet<string>): ObservationSink {
  return {
    async record(o) {
      // Re-checked at the sink as well as at construction. The two calls look redundant and are
      // not: `observationFrom` guards the path everybody uses today, and this one guards a record
      // built by hand tomorrow. A guard on the constructor only protects the constructor.
      await writer.append(jsonlLine(assertObservationCarriesNoContent(o, knownRuleIds)));
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * Stage 2: the candidate rule
 * ---------------------------------------------------------------------------------------------- */

export type CandidateStatus = "proposed" | "under-review" | "accepted" | "rejected";

/**
 * A proposed rule, written by a person from accumulated observations.
 *
 * `falsePositiveNote` is REQUIRED and non-empty, and that is the single most important line in this
 * type. It is the published condition under which the rule is WRONG, and `attachRemedies` injects
 * it as the rebuttal on every patch the rule proposes, so a missing or softened note travels
 * attached to an edit somebody is about to apply. It is also the field that takes the most work and
 * is therefore the easiest to defer, so the type refuses to be constructed without it.
 */
export interface CandidateRule {
  readonly id: string;
  readonly family: FamilyId;
  readonly title: string;
  readonly polarity: Polarity;
  readonly proposedWeight: number;
  readonly rationale: string;
  readonly falsePositiveNote: string;
  readonly prevention?: string;
  /** The corpus this rule would join, and the version it would enter in. */
  readonly corpus: string;
  readonly proposedSince: string;
  /** How many DISTINCT observations support it, and on which days. A count with no dates is a claim. */
  readonly support: {
    readonly observations: number;
    readonly days: readonly string[];
    readonly note: string;
  };
  readonly status: CandidateStatus;
  /**
   * Two reviewers, never one. A rule's author is the worst judge of its false-positive surface,
   * so `corpusSteward` alone can never move a candidate to `accepted`.
   */
  readonly review: {
    readonly corpusSteward: string | null;
    readonly falsePositiveHunter: string | null;
    readonly decidedOn: string | null;
    readonly reason: string | null;
  };
}

/** Below this, a candidate is an anecdote. Stated here rather than left to a reviewer's mood. */
export const MIN_SUPPORTING_OBSERVATIONS = 5;

export function assertWellFormedCandidate(c: CandidateRule): CandidateRule {
  const id = c.id || "(unnamed)";
  if (!c.id || !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(c.id)) {
    throw new MalformedCandidateError(id, "id must be a lowercase dotted rule id, matching the corpus convention");
  }
  for (const [field, value] of [
    ["title", c.title],
    ["rationale", c.rationale],
    ["corpus", c.corpus],
    ["proposedSince", c.proposedSince],
  ] as const) {
    if (!value || !String(value).trim()) throw new MalformedCandidateError(id, `${field} is empty`);
  }

  // THE ONE THAT MATTERS. A note is required, must be substantive, and must not be one of the
  // hedges that mean nothing. The forbidden list exists because "may occasionally be wrong" is
  // what a reviewer writes when they have not looked, and it reads as a note in a diff.
  const note = (c.falsePositiveNote ?? "").trim();
  if (!note) {
    throw new MalformedCandidateError(
      id,
      "falsePositiveNote is empty. It is the published condition under which this rule is WRONG, and it rides on every patch the rule proposes. Name the legitimate artifact that trips it.",
    );
  }
  if (note.length < 40) {
    throw new MalformedCandidateError(id, `falsePositiveNote is ${note.length} characters. Name a concrete legitimate artifact that trips this rule, not a hedge.`);
  }
  const HEDGES = [/^may (?:sometimes|occasionally) (?:be wrong|misfire)/i, /^could be a false positive/i, /^n\/?a$/i, /^none known$/i, /^tbd$/i, /^todo/i];
  for (const h of HEDGES) {
    if (h.test(note)) throw new MalformedCandidateError(id, `falsePositiveNote "${note.slice(0, 40)}..." is a hedge, not a condition. Name the legitimate artifact.`);
  }

  if (typeof c.proposedWeight !== "number" || Number.isNaN(c.proposedWeight)) throw new MalformedCandidateError(id, "proposedWeight must be a number");
  if (c.polarity === "signal" && c.proposedWeight <= 0) throw new MalformedCandidateError(id, "a signal rule must propose a positive weight");
  if (c.polarity === "counter" && c.proposedWeight >= 0) throw new MalformedCandidateError(id, "a counter rule must propose a negative weight");

  if (c.support.observations !== c.support.days.length) {
    throw new MalformedCandidateError(id, `support claims ${c.support.observations} observations but lists ${c.support.days.length} days. A count that disagrees with its own evidence is not support.`);
  }
  if (c.status === "accepted") {
    if (c.support.observations < MIN_SUPPORTING_OBSERVATIONS) {
      throw new MalformedCandidateError(id, `accepted on ${c.support.observations} observations, below the threshold of ${MIN_SUPPORTING_OBSERVATIONS}`);
    }
    if (!c.review.corpusSteward || !c.review.falsePositiveHunter) {
      throw new MalformedCandidateError(
        id,
        "accepted without both reviewers. corpus-steward AND false-positive-hunter must both have reported, because a rule's author is the worst judge of its false-positive surface.",
      );
    }
    if (!c.review.decidedOn) throw new MalformedCandidateError(id, "accepted with no decision date");
  }
  if (c.status === "rejected" && !c.review.reason) {
    throw new MalformedCandidateError(id, "rejected with no reason. A rejected candidate is the most useful thing in the directory: it stops the same idea being re-proposed every quarter.");
  }
  return c;
}
