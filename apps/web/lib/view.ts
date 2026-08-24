import type { Report } from "@slop/core";

/**
 * The wire shape between the engine and the UI.
 *
 * Why a projection rather than passing `Report` straight into components: the client half
 * of this app (the self-scan card, the reveal timeline, the expandable evidence) must not
 * pull the scoring engine into the browser bundle, and a serialisable plain object is what
 * crosses that boundary honestly. NOTHING IS DROPPED ON THE WAY THROUGH except fields no
 * surface renders: every finding keeps its full evidence array, its false-positive note and
 * its arithmetic, because a report that has been summarised for the UI is the black box
 * this product exists to argue against.
 */

export interface EvidenceView {
  readonly kind: string;
  readonly locator: string;
  readonly observed: string;
  readonly expected?: string;
  readonly excerpt?: string;
}

export interface FindingView {
  readonly ruleId: string;
  readonly family: string;
  readonly familyTitle: string;
  readonly title: string;
  readonly severity: string;
  readonly polarity: "signal" | "counter";
  readonly baseWeight: number;
  readonly weight: number;
  readonly hitsCounted: number;
  readonly points: number;
  readonly cappedOut: boolean;
  readonly evidence: readonly EvidenceView[];
  readonly explanation: string;
  readonly falsePositiveNote: string;
  readonly prevention?: string;
}

export interface FamilyView {
  readonly id: string;
  readonly title: string;
  readonly points: number;
  readonly atCap: boolean;
  readonly caveat: string;
  readonly findingCount: number;
}

export interface ScanMeta {
  /** What was scanned. Always shown: a scan without a stated target is a claim. */
  readonly target: string;
  readonly ranAt: string;
  /** Measured wall-clock duration of the run. The only number that gets animated. */
  readonly elapsedMs: number;
  /** Rule ids that were actually evaluated on this run. The denominator of "N checks". */
  readonly evaluated: readonly string[];
  /** How many rules the corpus contains, so "39 of 39" is checkable. */
  readonly corpusSize: number;
}

export interface ScanView extends ScanMeta {
  readonly status: Report["status"];
  readonly score: number | null;
  readonly bandLabel: string;
  readonly verdict: string;
  readonly corpusVersion: string;
  readonly coverageRatio: number;
  readonly coverageExamined: string;
  readonly abstention: readonly { readonly code: string; readonly detail: string }[];
  readonly findings: readonly FindingView[];
  readonly counterEvidence: readonly FindingView[];
  readonly families: readonly FamilyView[];
  readonly priorPoints: number;
  readonly computedScore: number;
  readonly disclaimer: string;
  readonly warnings: readonly string[];
  /**
   * How many listed items were INFERRED rather than measured. Printed on every receipt as
   * a standing commitment: the moment a heuristic finding ships, this stops being zero and
   * the reader can see it. It is derived from the evidence kind the detector declared, not
   * hardcoded.
   */
  readonly inferredCount: number;
}

const line = (l: Report["receipt"]["lines"][number]): FindingView => ({
  ruleId: l.ruleId,
  family: l.family,
  familyTitle: l.familyTitle,
  title: l.title,
  severity: l.severity,
  polarity: l.polarity,
  baseWeight: l.baseWeight,
  weight: l.weight,
  hitsCounted: l.hitsCounted,
  points: l.points,
  cappedOut: l.cappedOut,
  evidence: l.evidence.map((e) => ({
    kind: e.kind,
    locator: e.locator,
    observed: e.observed,
    ...(e.expected ? { expected: e.expected } : {}),
    ...(e.excerpt ? { excerpt: e.excerpt } : {}),
  })),
  explanation: l.explanation,
  falsePositiveNote: l.falsePositiveNote,
  ...(l.prevention ? { prevention: l.prevention } : {}),
});

export function toScanView(report: Report, meta: ScanMeta): ScanView {
  const all = report.receipt.lines.map(line);
  return {
    ...meta,
    status: report.status,
    score: report.score,
    bandLabel: report.bandLabel,
    verdict: report.verdict,
    corpusVersion: report.corpusVersion,
    coverageRatio: report.coverage.ratio,
    coverageExamined: report.coverage.examined,
    abstention: report.abstention.map((a) => ({ code: a.code, detail: a.detail })),
    findings: all.filter((l) => l.polarity === "signal"),
    counterEvidence: all.filter((l) => l.polarity === "counter"),
    families: report.receipt.families.map((f) => ({
      id: f.id,
      title: f.title,
      points: f.points,
      atCap: f.atCap,
      caveat: f.caveat,
      findingCount: f.findingCount,
    })),
    priorPoints: report.receipt.priorPoints,
    computedScore: report.receipt.computedScore,
    disclaimer: report.disclaimer,
    warnings: [...report.warnings],
    // Both shipped detectors declare `deterministic`. If a probabilistic detector is ever
    // added, its findings land here and the counter moves off zero on its own.
    inferredCount: report.evidenceKinds.filter((k) => k === "probabilistic").length,
  };
}

/** "12 s ago", "3 min ago". Rendered client-side so it does not go stale mid-page. */
export function ago(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 90) return `${seconds} s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} h ago`;
}

/** Seconds, one decimal. The receipt's largest object is one of these. */
export const seconds = (ms: number): string => (ms / 1000).toFixed(1);
