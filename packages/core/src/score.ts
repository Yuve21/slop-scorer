import { ABSTENTION_STATUS, MAX_SCORE, MIN_SCORE, verdictSentence } from "./assessment.js";
import type { AbstentionCode, AbstentionReason, AssessmentStatus } from "./assessment.js";
import { BAND_LABELS, DEFAULT_CONFIG, REPORT_DISCLAIMER } from "./config.js";
import type { Band, FamilySpec, ScoringConfig } from "./config.js";
import { ReceiptMismatchError } from "./errors.js";
import { clamp, logit, positionDecay, sigmoid } from "./math.js";
import type { Remediation } from "./remediation.js";
import type { Coverage, DetectorResult, Evidence, FamilyId, Finding, Modality, Severity } from "./types.js";

/**
 * The scoring engine.
 *
 * Hard constraints, all of them enforced below rather than documented and hoped for:
 *
 *  - NO MODEL IN THE SCORING PATH. Not a classifier, not an LLM, not an agent. The engine
 *    is a pure function of (findings, config). The same artifact and the same corpus
 *    version produce the same number forever, which is what makes a benchmark honest and
 *    an appeal answerable.
 *  - THE REPORT IS A RECEIPT. Prior points plus every printed contribution equals the
 *    printed score, in integers, exactly. Enforced by `ReceiptMismatchError`.
 *  - FAMILIES ARE CAPPED. No family can carry a verdict on its own.
 *  - COUNTER-EVIDENCE IS FIRST CLASS. Negative findings are receipt lines like any other.
 *  - LOW COVERAGE ABSTAINS. It does not produce a low score. A thin read looks exactly
 *    like a clean artifact, and the difference between those two is the whole product.
 *
 * Contributions are computed by SEQUENTIAL ATTRIBUTION, not by leave-one-out. Findings are
 * added one at a time in a fixed canonical order and each one's contribution is the change
 * in the rounded score. Those deltas telescope, so they sum to (score - prior) exactly,
 * with no normalisation fudge. Leave-one-out deltas would be more symmetric and would not
 * add up, and a receipt that nearly adds up is a black box wearing a receipt.
 */

export interface ReceiptLine {
  readonly ruleId: string;
  readonly family: FamilyId;
  readonly familyTitle: string;
  readonly title: string;
  readonly polarity: Finding["polarity"];
  readonly severity: Severity;
  readonly detectorId: string;
  readonly modality: Modality;
  readonly baseWeight: number;
  readonly weight: number;
  readonly hitsCounted: number;
  /** Contribution to the printed score, in whole points. Negative for counter-evidence. */
  readonly points: number;
  /**
   * True when the finding moved the score by zero because its family was already at cap.
   * Printed, not hidden: "we saw this and it did not change the number" is information.
   */
  readonly cappedOut: boolean;
  readonly evidence: readonly Evidence[];
  readonly explanation: string;
  readonly falsePositiveNote: string;
  readonly prevention?: string;
  /** Carried through from the finding so the receipt and the fix proposal cannot diverge. */
  readonly remediation?: readonly Remediation[];
}

export interface FamilySummary {
  readonly id: FamilyId;
  readonly title: string;
  readonly capShare: number;
  readonly capLogit: number;
  /** Logit the family's findings produced before the cap was applied. */
  readonly rawLogit: number;
  readonly cappedLogit: number;
  readonly atCap: boolean;
  readonly findingCount: number;
  readonly points: number;
  readonly caveat: string;
}

export interface Receipt {
  readonly priorPoints: number;
  readonly lines: readonly ReceiptLine[];
  readonly families: readonly FamilySummary[];
  readonly globalCounterLogit: number;
  readonly globalCounterAtCap: boolean;
  /** The score the engine computed, present even when it is withheld from `Report.score`. */
  readonly computedScore: number;
  /** Always true. If it could be false the constructor would have thrown. */
  readonly reconciles: true;
}

export interface Report {
  readonly corpusVersion: string;
  readonly generatedAt: string;
  /**
   * First-class, exhaustive, and the field a consumer must branch on before reading `score`.
   * `inconclusive` and `not_assessed` are not low scores and not clean bills of health.
   */
  readonly status: AssessmentStatus;
  /** Null unless `status === "assessed"`. The score is withheld, never softened. */
  readonly score: number | null;
  /** Null unless `status === "assessed"`. Abstention is a status, not a band. */
  readonly band: Band | null;
  readonly bandLabel: string;
  /** Set when the score qualified for a higher band but did not meet its gate. */
  readonly bandDemotedFrom?: Band;
  /** Coded reasons the score was withheld. Empty when `status === "assessed"`. */
  readonly abstention: readonly AbstentionReason[];
  /**
   * The sentence the UI leads with. Describes what WE did to the artifact. It has no
   * grammatical slot for a person and cannot be quoted as an allegation about one.
   */
  readonly verdict: string;
  readonly coverage: Coverage;
  readonly familiesFired: number;
  readonly evidenceKinds: readonly string[];
  readonly modalities: readonly Modality[];
  readonly detectors: readonly string[];
  readonly receipt: Receipt;
  readonly counterEvidence: readonly ReceiptLine[];
  /** Ranked "remove this and the score drops by N", the falsifiable half of the claim. */
  readonly whatWouldChangeThisScore: readonly {
    readonly ruleId: string;
    readonly points: number;
    readonly prevention?: string;
  }[];
  readonly disclaimer: string;
  readonly warnings: readonly string[];
}

interface Contributor {
  readonly finding: Finding;
  readonly detectorId: string;
  readonly modality: Modality;
}

const familyOf = (config: ScoringConfig, id: FamilyId): FamilySpec =>
  config.families.find((f) => f.id === id) ?? {
    id,
    title: id,
    capShare: 0.05,
    order: 99,
    caveat: "Unregistered family. Capped at the minimum until it is added to the corpus config.",
  };

/** Canonical order. Fixed, because sequential attribution depends on it being fixed. */
const canonicalOrder = (config: ScoringConfig, contributors: readonly Contributor[]): Contributor[] =>
  [...contributors].sort((a, b) => {
    const ga = a.finding.polarity === "counter" && a.finding.counterScope === "global" ? 1 : 0;
    const gb = b.finding.polarity === "counter" && b.finding.counterScope === "global" ? 1 : 0;
    if (ga !== gb) return ga - gb; // global counters last: they argue with the whole verdict
    const fa = familyOf(config, a.finding.family).order;
    const fb = familyOf(config, b.finding.family).order;
    if (fa !== fb) return fa - fb;
    const pa = a.finding.polarity === "counter" ? 1 : 0;
    const pb = b.finding.polarity === "counter" ? 1 : 0;
    if (pa !== pb) return pa - pb; // signals before the counters that argue with them
    const wa = Math.abs(b.finding.weight) - Math.abs(a.finding.weight);
    if (wa !== 0) return wa;
    return a.finding.ruleId.localeCompare(b.finding.ruleId);
  });

interface LogitBreakdown {
  readonly z: number;
  readonly families: Map<FamilyId, { raw: number; capped: number; cap: number; count: number }>;
  readonly globalCounter: { raw: number; capped: number };
}

/** Pure: (subset of findings, config) -> logit and the family breakdown that produced it. */
function combine(config: ScoringConfig, contributors: readonly Contributor[]): LogitBreakdown {
  const byFamily = new Map<FamilyId, { signals: number[]; counters: number[] }>();
  const globalCounters: number[] = [];

  for (const c of contributors) {
    const f = c.finding;
    if (f.polarity === "counter" && f.counterScope === "global") {
      globalCounters.push(f.weight);
      continue;
    }
    let bucket = byFamily.get(f.family);
    if (!bucket) {
      bucket = { signals: [], counters: [] };
      byFamily.set(f.family, bucket);
    }
    (f.polarity === "counter" ? bucket.counters : bucket.signals).push(f.weight);
  }

  const decayedSum = (weights: number[]): number => {
    const sorted = [...weights].sort((a, b) => Math.abs(b) - Math.abs(a));
    let sum = 0;
    sorted.forEach((w, i) => {
      sum += w * positionDecay(i + 1);
    });
    return sum;
  };

  const families = new Map<FamilyId, { raw: number; capped: number; cap: number; count: number }>();
  let z = logit(config.prior);

  for (const [id, bucket] of byFamily) {
    const spec = familyOf(config, id);
    const cap = spec.capShare * config.logitBudget;
    const raw = decayedSum(bucket.signals) + decayedSum(bucket.counters);
    const capped = clamp(raw, -cap, cap);
    families.set(id, { raw, capped, cap, count: bucket.signals.length + bucket.counters.length });
    z += capped;
  }

  const gRaw = decayedSum(globalCounters);
  const gCapped = clamp(gRaw, -config.globalCounterCap, config.globalCounterCap);
  z += gCapped;

  return { z, families, globalCounter: { raw: gRaw, capped: gCapped } };
}

/**
 * Logit to points, capped at `MAX_SCORE` (99) rather than 100.
 *
 * Radar's scale is 0-99 and the missing rung is the point of it: there is no arrangement of
 * evidence, weights or thresholds in this engine that produces a "100% AI" screenshot,
 * because the arithmetic cannot reach one. Enforced here, in the scoring path, so no
 * formatter or caller can reintroduce certainty.
 */
const scoreFromLogit = (z: number): number => clamp(Math.round(100 * sigmoid(z)), MIN_SCORE, MAX_SCORE);

/** Score a subset. Exported for tests and for the "what would change this" calculation. */
export function scoreOf(config: ScoringConfig, contributors: readonly Contributor[]): number {
  return scoreFromLogit(combine(config, contributors).z);
}

/** Coverage across several results, weighted by each probe's declared coverage weight. */
function combineCoverage(results: readonly DetectorResult[]): Coverage {
  if (results.length === 1) return results[0]!.coverage;
  const probes = results.flatMap((r) => r.coverage.probes);
  let num = 0;
  let den = 0;
  for (const r of results) {
    const w = r.coverage.probes.reduce((a, p) => a + (p.weight ?? 1), 0) || 1;
    num += r.coverage.ratio * w;
    den += w;
  }
  return {
    ratio: den === 0 ? 0 : num / den,
    probes,
    examined: results.map((r) => `${r.detectorId}: ${r.coverage.examined}`).join("; "),
  };
}

export interface ScoreOptions {
  readonly config?: ScoringConfig;
  readonly now?: () => Date;
}

const ABSTENTION_LABEL: Readonly<Record<AssessmentStatus, string>> = {
  assessed: "assessed",
  inconclusive: "we examined this and are not reporting a score",
  not_assessed: "we did not examine this",
};

/**
 * `not_assessed` beats `inconclusive` when both apply.
 *
 * If we never looked, saying "we looked and cannot tell" is a smaller lie than a score but
 * still a lie. The stronger abstention wins.
 */
function statusOf(reasons: readonly AbstentionReason[]): AssessmentStatus {
  if (reasons.length === 0) return "assessed";
  return reasons.some((r) => ABSTENTION_STATUS[r.code] === "not_assessed") ? "not_assessed" : "inconclusive";
}

const EMPTY_COVERAGE: Coverage = { ratio: 0, probes: [], examined: "nothing" };

/**
 * A report for an artifact we never examined.
 *
 * This exists so that "no detector accepts this input", "this modality is out of scope in
 * this build" and "the owner opted out" all produce a Report of the same shape as a real
 * one, with `status: "not_assessed"` and `score: null`. The alternative is an exception at
 * the call site, and an exception at the call site is how a caller ends up rendering a
 * zero: the empty state and the clean state converge, which is the exact failure this
 * product is built to avoid.
 */
export function notAssessed(
  code: Extract<
    AbstentionCode,
    "no_detector_for_input" | "out_of_scope_modality" | "detector_unavailable" | "opted_out" | "cannot_fetch"
  >,
  detail: string,
  options: ScoreOptions = {},
): Report {
  const config = options.config ?? DEFAULT_CONFIG;
  const now = options.now ?? (() => new Date());
  const abstention: readonly AbstentionReason[] = [{ code, detail }];
  return {
    corpusVersion: config.corpusVersion,
    generatedAt: now().toISOString(),
    status: "not_assessed",
    score: null,
    band: null,
    bandLabel: ABSTENTION_LABEL.not_assessed,
    abstention,
    verdict: verdictSentence({
      status: "not_assessed",
      score: null,
      bandLabel: ABSTENTION_LABEL.not_assessed,
      rulesFired: 0,
      rulesEvaluated: 0,
      corpusVersion: config.corpusVersion,
      coverageRatio: 0,
      reasons: abstention,
    }),
    coverage: EMPTY_COVERAGE,
    familiesFired: 0,
    evidenceKinds: [],
    modalities: [],
    detectors: [],
    receipt: {
      priorPoints: 0,
      lines: [],
      families: [],
      globalCounterLogit: 0,
      globalCounterAtCap: false,
      computedScore: 0,
      reconciles: true,
    },
    counterEvidence: [],
    whatWouldChangeThisScore: [],
    disclaimer: REPORT_DISCLAIMER,
    warnings: [],
  };
}

/**
 * Build the report. This is the only public way to turn detector output into a number.
 */
export function buildReport(
  results: readonly DetectorResult[],
  options: ScoreOptions = {},
): Report {
  if (results.length === 0) {
    return notAssessed(
      "no_detector_for_input",
      "no detector in this build produced a result for this input, so nothing was examined.",
      options,
    );
  }
  const config = options.config ?? DEFAULT_CONFIG;
  const now = options.now ?? (() => new Date());

  const contributors: Contributor[] = results.flatMap((r) =>
    r.findings.map((finding) => ({ finding, detectorId: r.detectorId, modality: r.modality })),
  );
  const ordered = canonicalOrder(config, contributors);

  // Sequential attribution. Contribution k is the change in the ROUNDED score caused by
  // adding finding k to the prefix before it. These telescope, so they sum exactly.
  const priorPoints = scoreFromLogit(logit(config.prior));
  const lines: ReceiptLine[] = [];
  let running = priorPoints;
  for (let k = 0; k < ordered.length; k += 1) {
    const prefix = ordered.slice(0, k + 1);
    const next = scoreOf(config, prefix);
    const points = next - running;
    running = next;
    const c = ordered[k]!;
    const f = c.finding;
    const spec = familyOf(config, f.family);
    const line: ReceiptLine = {
      ruleId: f.ruleId,
      family: f.family,
      familyTitle: spec.title,
      title: f.title,
      polarity: f.polarity,
      severity: f.severity,
      detectorId: c.detectorId,
      modality: c.modality,
      baseWeight: f.baseWeight,
      weight: f.weight,
      hitsCounted: f.hitsCounted,
      points,
      cappedOut: points === 0 && f.weight !== 0,
      evidence: f.evidence,
      explanation: f.explanation,
      falsePositiveNote: f.falsePositiveNote,
      ...(f.prevention ? { prevention: f.prevention } : {}),
      ...(f.remediation && f.remediation.length > 0 ? { remediation: f.remediation } : {}),
    };
    lines.push(line);
  }

  const computedScore = running;
  const breakdown = combine(config, ordered);

  const families: FamilySummary[] = [...breakdown.families.entries()]
    .map(([id, v]) => {
      const spec = familyOf(config, id);
      return {
        id,
        title: spec.title,
        capShare: spec.capShare,
        capLogit: v.cap,
        rawLogit: v.raw,
        cappedLogit: v.capped,
        atCap: Math.abs(v.raw) > Math.abs(v.capped) + 1e-9,
        findingCount: v.count,
        points: lines.filter((l) => l.family === id).reduce((a, l) => a + l.points, 0),
        caveat: spec.caveat,
      };
    })
    .sort((a, b) => familyOf(config, a.id).order - familyOf(config, b.id).order);

  const sumPoints = lines.reduce((a, l) => a + l.points, 0);
  if (priorPoints + sumPoints !== computedScore) {
    throw new ReceiptMismatchError(
      computedScore,
      priorPoints + sumPoints,
      `prior=${priorPoints}, ${lines.length} contribution(s) summing to ${sumPoints}.`,
    );
  }

  const receipt: Receipt = {
    priorPoints,
    lines,
    families,
    globalCounterLogit: breakdown.globalCounter.capped,
    globalCounterAtCap:
      Math.abs(breakdown.globalCounter.raw) > Math.abs(breakdown.globalCounter.capped) + 1e-9,
    computedScore,
    reconciles: true,
  };

  const coverage = combineCoverage(results);
  const firedFamilies = new Set(
    contributors.filter((c) => c.finding.polarity === "signal").map((c) => c.finding.family),
  );
  const familiesFired = firedFamilies.size;

  // Abstention. Low coverage does NOT produce a low score: a page that would not render is
  // indistinguishable from a clean one, and printing a confident 12 over a 20% read is the
  // single most dishonest thing this engine could do.
  const abstention: AbstentionReason[] = [];
  // Detector-declared reasons come FIRST, because they are the ones the engine could not
  // have worked out for itself: laundered bytes, a source we may not fetch, a
  // provenance-first read that met silence. They are facts about the artifact, and they
  // must not be ranked below an inference about the result.
  for (const r of results) for (const reason of r.abstention ?? []) abstention.push(reason);
  if (coverage.ratio < config.minCoverage) {
    abstention.push({
      code: "coverage_below_floor",
      detail:
        `Only ${Math.round(coverage.ratio * 100)}% of the planned probes returned data (the floor is ${Math.round(
          config.minCoverage * 100,
        )}%). A thin read of an artifact looks exactly like a clean artifact, so we are not reporting a number for it.`,
    });
  }
  const deadProbes = coverage.probes.filter((p) => p.ran && p.expectsNonEmpty && (p.denominator ?? 0) === 0);
  if (deadProbes.length > 0) {
    abstention.push({
      code: "probe_failed",
      detail: `${deadProbes.length} probe(s) ran and collected nothing: ${deadProbes
        .map((p) => p.id)
        .join(", ")}. Every rule below them failed to fire for a reason that has nothing to do with the artifact.`,
    });
  }
  // A probe that ran, collected something, and could not read part of the artifact. This is
  // the SAME failure as the one above wearing different clothes, and it is the one a
  // denominator cannot express: the count came back non-zero, so nothing looked wrong, while
  // a region of the artifact went unread and every "we found nothing there" below it was
  // reached without looking. It must never be answered with a quietly lower coverage number
  // and no other trace, because a confident negative over an unread region is a fabricated
  // finding, and this product's entire value is that a finding can be trusted.
  const partialProbes = coverage.probes.filter((p) => p.ran && p.complete === false);
  if (partialProbes.length > 0) {
    abstention.push({
      code: "probe_failed",
      detail: `${partialProbes.length} probe(s) ran and could not read part of what they were pointed at: ${partialProbes
        .map((p) => p.id)
        .join(", ")}. What was not read cannot be reported as absent, so the number is withheld rather than computed over the part that happened to parse.`,
    });
  }
  if (familiesFired < config.minFamiliesFired && computedScore >= config.minFamiliesAppliesAtOrAbove) {
    abstention.push({
      code: "single_family_only",
      detail:
        `${familiesFired} independent rule famil${familiesFired === 1 ? "y" : "ies"} fired (the minimum is ${
          config.minFamiliesFired
        }) for a computed ${computedScore}. One family on its own is a correlated observation rather than corroboration, and this number is high enough to read as a claim.`,
    });
  }

  let band: Band | null;
  let demotedFrom: Band | undefined;
  if (abstention.length > 0) {
    band = null;
  } else if (computedScore >= config.topBandFloor) {
    const gateFamilies = familiesFired >= config.topBandRequires.families;
    const gateAnchor = config.topBandRequires.anyOfFamilies.some((f) => firedFamilies.has(f));
    if (gateFamilies && gateAnchor) {
      band = "heavy-template-signature";
    } else {
      // The top band cannot be reached on look alone. This single constraint prevents the
      // category's signature failure: a well-designed human site with a cream palette and
      // a component library being called 94% AI.
      band = "many-signals";
      demotedFrom = "heavy-template-signature";
    }
  } else if (computedScore >= config.bandFloors.many) {
    band = "many-signals";
  } else if (computedScore >= config.bandFloors.some) {
    band = "some-signals";
  } else {
    band = "few-signals";
  }

  const counterEvidence = lines.filter((l) => l.polarity === "counter");
  const whatWouldChange = lines
    .filter((l) => l.polarity === "signal" && l.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 5)
    .map((l) => ({ ruleId: l.ruleId, points: l.points, ...(l.prevention ? { prevention: l.prevention } : {}) }));

  const status: AssessmentStatus = band === null ? statusOf(abstention) : "assessed";
  const bandLabel = band === null ? ABSTENTION_LABEL[status] : BAND_LABELS[band];
  const rulesEvaluated = new Set(results.flatMap((r) => r.rulesEvaluated)).size;

  return {
    corpusVersion: config.corpusVersion,
    generatedAt: now().toISOString(),
    status,
    score: status === "assessed" ? computedScore : null,
    band,
    bandLabel,
    ...(demotedFrom ? { bandDemotedFrom: demotedFrom } : {}),
    abstention,
    verdict: verdictSentence({
      status,
      score: status === "assessed" ? computedScore : null,
      bandLabel,
      rulesFired: contributors.length,
      rulesEvaluated,
      corpusVersion: config.corpusVersion,
      coverageRatio: coverage.ratio,
      reasons: abstention,
    }),
    coverage,
    familiesFired,
    // Detector-level kinds PLUS any finding that declared a weaker one of its own. A report
    // holding one OCR read inside an otherwise deterministic scan has to say so here, or the
    // surface that counts inferred lines counts zero and prints "all of it is re-readable".
    evidenceKinds: [
      ...new Set([
        ...results.map((r) => r.evidenceKind),
        ...contributors.map((c) => c.finding.evidenceKind).filter((k): k is NonNullable<typeof k> => !!k),
      ]),
    ],
    modalities: [...new Set(results.map((r) => r.modality))],
    detectors: results.map((r) => r.detectorId),
    receipt,
    counterEvidence,
    whatWouldChangeThisScore: whatWouldChange,
    disclaimer: REPORT_DISCLAIMER,
    warnings: results.flatMap((r) => r.warnings ?? []),
  };
}
