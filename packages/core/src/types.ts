/**
 * The detector plugin contract.
 *
 * Every modality (web, code, text, image, video, audio) implements the SAME `Detector`
 * interface and returns the SAME `DetectorResult`. The scoring engine in `score.ts` knows
 * nothing about any modality: it only knows findings, families, weights and coverage.
 * That is what lets a second modality ship without touching the engine.
 *
 * Three rules the shape below enforces rather than requests:
 *
 *  1. NO EVIDENCE, NO FINDING. `Finding.evidence` is a non-empty array by contract and is
 *     checked at runtime by `assertWellFormedResult`. A finding a user cannot go and look
 *     at is an opinion, and opinions do not move a score.
 *  2. COVERAGE IS NOT OPTIONAL. A detector must say how much of the artifact it actually
 *     examined. A score from a 20%-covered artifact is not comparable to a score from a
 *     fully rendered one, and the engine withholds the score rather than print a
 *     confident number over a thin read.
 *  3. EVIDENCE KIND IS DECLARED PER RESULT. "deterministic" (a fact you can re-read in
 *     DevTools), "probabilistic" (a model or a statistic over a distribution) and
 *     "provenance" (a signed manifest or a declared disclosure) are three different
 *     epistemic claims. The UI must be able to say which one it is holding, per modality,
 *     without guessing.
 */

import type { AbstentionReason } from "./assessment.js";

/** Artifact classes the product scores. One detector serves exactly one modality. */
export type Modality = "web" | "code" | "text" | "image" | "video" | "audio";

/**
 * How a detector knows what it claims to know. Declared per result, not per product, so a
 * multi-modal report can be honest about a deterministic web read sitting next to a
 * probabilistic image read.
 */
export type EvidenceKind =
  /** A fact re-readable by the user: a header, a computed style, a file at a path. */
  | "deterministic"
  /** A statistic or model output over a distribution. Never re-readable, always a claim. */
  | "probabilistic"
  /** A signed manifest, a watermark, or a declared disclosure (C2PA, SynthID, AIGC label). */
  | "provenance";

/** Inputs the product accepts. A detector declares which ones it can handle. */
export type Input =
  | { readonly kind: "url"; readonly url: string }
  | { readonly kind: "repo"; readonly path: string; readonly ref?: string }
  | { readonly kind: "text"; readonly text: string; readonly source?: string }
  | { readonly kind: "file"; readonly path: string; readonly mediaType: string }
  | { readonly kind: "media-url"; readonly url: string; readonly mediaType?: string }
  /**
   * A previously collected artifact, replayed. This is what makes a report re-scorable
   * against a newer corpus without re-fetching the site, and what makes the published
   * benchmark reproducible. Detectors that support it declare `replayable: true`.
   */
  | { readonly kind: "artifact"; readonly detectorId: string; readonly artifact: unknown };

export type InputKind = Input["kind"];

/**
 * A concrete citation. `locator` is where to look, `observed` is what was there. Both are
 * mandatory: a finding whose evidence cannot be pointed at is not a finding.
 */
export interface Evidence {
  /** What kind of place `locator` names. Drives how the UI renders the citation. */
  readonly kind:
    | "selector" // "h1.font-hero"
    | "css" // "letter-spacing on h1.font-hero"
    | "header" // "content-security-policy"
    | "url" // "https://example.com/CLAUDE.md"
    | "file" // "src/app/page.tsx"
    | "line" // "src/app/page.tsx:42"
    | "request" // "GET /_next/static/chunks/main.js"
    | "text" // a quoted span of prose
    | "metric" // "totalJsBytes"
    | "timestamp" // "00:04:12" in a video or audio artifact
    | "region"; // a crop of an image or a video frame
  /** Where to look. A selector, a path, a URL, a header name, a timecode. */
  readonly locator: string;
  /** What was actually there. Always a string so the receipt renders without a formatter. */
  readonly observed: string;
  /** What a non-generated artifact would have shown, when there is a defensible answer. */
  readonly expected?: string;
  /** A short verbatim excerpt, for text and source-map evidence. */
  readonly excerpt?: string;
  /** Seconds into a video or audio artifact. */
  readonly atSeconds?: number;
  /** Pixel box in an image or a video frame, for a visible crop. */
  readonly region?: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
}

export type Severity = "info" | "low" | "medium" | "high";

/**
 * Which direction a finding moves the score.
 *
 * Counter-evidence is not a nicety. Detecting tells is a weekend; knowing which tells lie
 * is the corpus. A detector that can only find guilt will find it everywhere, so
 * `assertWellFormedResult` requires that a detector which declares counter rules actually
 * evaluated them.
 */
export type Polarity = "signal" | "counter";

/**
 * Whether a counter finding offsets its own family or the whole score.
 *
 * `family` counters argue with one family ("this cream background is category convention,
 * not a tell"). `global` counters argue with the whole verdict ("this site self-hosts a
 * licensed foundry face; generators do not license type") and therefore bypass family caps,
 * subject to their own cap.
 */
export type CounterScope = "family" | "global";

/** A rule family. Ids are strings so a new modality can add its own without a core change. */
export type FamilyId = string;

/** One rule firing, with its citations. Rules fire at most once; repeats become evidence. */
export interface Finding {
  readonly ruleId: string;
  readonly family: FamilyId;
  readonly title: string;
  readonly severity: Severity;
  readonly polarity: Polarity;
  readonly counterScope?: CounterScope;
  /** The rule's declared log-odds weight, before any decay or cap. Negative for counters. */
  readonly baseWeight: number;
  /**
   * `baseWeight` after within-rule multiplicity. Repeated evidence of the SAME rule is
   * correlated, so hit k contributes baseWeight/k (harmonic), truncated at the rule's cap.
   */
  readonly weight: number;
  /** How many evidence items were counted toward `weight` (may be less than evidence.length). */
  readonly hitsCounted: number;
  /** Non-empty by contract. Checked at runtime. */
  readonly evidence: readonly Evidence[];
  /** Plain language, for a human, saying what was observed and why it is a signal. */
  readonly explanation: string;
  /** The honest caveat, shown inline in the report, never buried in an FAQ. */
  readonly falsePositiveNote: string;
  /** What to do instead. This field, not the score, is the MCP server's primary payload. */
  readonly prevention?: string;
}

/** One probe's outcome. A probe that ran but collected nothing is a FAILURE, not a pass. */
export interface ProbeStatus {
  readonly id: string;
  readonly ran: boolean;
  /**
   * How many things the probe actually collected. Zero from a probe that was supposed to
   * collect something is the vacuous-scan bug: every "none of them are bad" rule downstream
   * passes having examined nothing, and the artifact silently scores LOW.
   *
   * Detectors must report this. `assertWellFormedResult` treats `ran: true, denominator: 0`
   * on a probe declared `expectsNonEmpty` as a hard error.
   */
  readonly denominator?: number;
  readonly expectsNonEmpty?: boolean;
  /** Share of total coverage this probe is worth. Defaults to 1. */
  readonly weight?: number;
  readonly note?: string;
}

/** How much of the artifact was actually examined. */
export interface Coverage {
  /** 0..1, the probe-weight share that succeeded. Below the engine floor means INCONCLUSIVE. */
  readonly ratio: number;
  readonly probes: readonly ProbeStatus[];
  /** Human summary: "rendered DOM, 12 chunks, 6 well-known paths". */
  readonly examined: string;
}

export interface RuleDescriptor {
  readonly id: string;
  readonly family: FamilyId;
  readonly title: string;
  readonly polarity: Polarity;
  readonly baseWeight: number;
  readonly severity: Severity;
  readonly explanation: string;
  readonly falsePositiveNote: string;
  readonly prevention?: string;
  /** Corpus version this rule entered in, so old reports stay explicable. */
  readonly since: string;
}

/** What every detector returns, for every modality. */
export interface DetectorResult {
  readonly detectorId: string;
  readonly modality: Modality;
  readonly evidenceKind: EvidenceKind;
  readonly corpusVersion: string;
  readonly input: Input;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly findings: readonly Finding[];
  readonly coverage: Coverage;
  /** Rule ids that were evaluated and did not fire. Makes "we looked" auditable. */
  readonly rulesEvaluated: readonly string[];
  /** Non-fatal problems: a probe that timed out, a redirect that left the origin. */
  readonly warnings?: readonly string[];
  /**
   * Abstention the DETECTOR declares, as opposed to abstention the engine infers.
   *
   * The engine can work out that coverage was thin or that one family carried everything,
   * because those are properties of the result. It cannot work out that the bytes arrived
   * re-encoded, that a platform URL may not be fetched, or that a provenance-first read met
   * silence: those are facts only the detector saw. `buildReport` merges these with its own
   * reasons and withholds the score, so a detector can force an honest silence rather than
   * having to fake a low coverage number to get one.
   *
   * Additive and optional. A detector that never sets it behaves exactly as before.
   */
  readonly abstention?: readonly AbstentionReason[];
  /**
   * The collected observations, for replay. Storing this rather than the source content is
   * what makes a report re-scorable against a new corpus at a fraction of the storage and
   * none of the copyright exposure.
   */
  readonly artifact?: unknown;
}

export interface AnalyzeContext {
  readonly signal?: AbortSignal;
  readonly now?: () => Date;
  /** Per-detector knobs. Never used to change weights; weights live in the corpus. */
  readonly options?: Readonly<Record<string, unknown>>;
}

/** The plugin contract. One per modality. */
export interface Detector {
  readonly id: string;
  readonly modality: Modality;
  readonly evidenceKind: EvidenceKind;
  readonly corpusVersion: string;
  /** Input kinds this detector will accept. Advertised so a router can pick without probing. */
  readonly accepts: readonly InputKind[];
  /** True when the detector accepts `{ kind: "artifact" }` for offline re-scoring. */
  readonly replayable: boolean;
  /** The corpus, exposed so an agent can read the rules BEFORE generating. */
  readonly rules: readonly RuleDescriptor[];
  /** Cheap and synchronous. Must not perform I/O. */
  canHandle(input: Input): boolean;
  analyze(input: Input, ctx?: AnalyzeContext): Promise<DetectorResult>;
}
