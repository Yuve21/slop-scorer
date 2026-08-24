/**
 * The substantiation record.
 *
 * *In re Workado* (FTC consent order, 2026) is a false-and-unsubstantiated-claim count over a
 * detector's advertised performance figure. The pleaded facts are a checklist: the respondent did
 * not build the model, did not test it against the advertised use cases, and could not produce
 * substantiation. Every "we remade this in N seconds for $X" this product publishes is a
 * performance claim of the same shape, so the evidence for it is captured AT THE TIME OF THE CALL
 * and held as data, not reconstructed from logs later or written into a marketing document.
 *
 * Two consequences that shape this file:
 *
 *  1. NO FIGURE IS EVER WRITTEN DOWN. `aggregate()` computes from the entries in hand. Nothing in
 *     this package, its README or its tool strings states a rate or a duration as a constant, and
 *     core's `no-claims` suite walks the source to keep it that way. An author who needs to state
 *     a measured figure has to make the harness print it, which is exactly the behaviour the order
 *     is trying to produce.
 *
 *  2. VENDORS THAT BAR COMPARATIVE PUBLICATION ARE EXCLUDABLE AS DATA. Two of the reviewed vendors
 *     have operative benchmarking clauses. `publishableOnly` filters them out of an aggregate
 *     intended for publication, rather than somebody remembering which ones they were.
 *
 * The entry carries the artifact's digest and byte length and nothing else about it, for the same
 * reason `ArtifactRef` does: a log line that identifies a person is a log line that can be
 * subpoenaed to identify a person.
 */

import type {
  AttemptOutcome,
  ConfounderCode,
  ReproductionAttempt,
  ReproductionModality,
} from "./types.js";

export interface SubstantiationEntry {
  readonly requestId: string;
  readonly attemptId: string;
  /* --- the input, as much of it as may be recorded --- */
  readonly artifactSha256: string;
  readonly artifactMediaType: string;
  readonly artifactByteLength: number;
  readonly modality: ReproductionModality;
  /* --- the call --- */
  readonly providerId: string;
  readonly model: string;
  readonly prompt: string;
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly elapsedMs: number;
  readonly costUsd: number;
  readonly outcome: AttemptOutcome;
  readonly refusalNote?: string;
  readonly confounder?: ConfounderCode;
  /* --- the controls that ran in front of the call --- */
  readonly consentId: string;
  readonly faceDetectorId: string;
  readonly faceDetectorProductionGrade: boolean;
  readonly faceRegionsExcluded: boolean;
  /** False when the vendor's terms bar us from publishing a comparison naming it. */
  readonly publishableInComparisons: boolean;
}

export interface SubstantiationAggregate {
  readonly n: number;
  readonly byModality: Readonly<Record<ReproductionModality, number>>;
  readonly byOutcome: Readonly<Record<AttemptOutcome, number>>;
  /** Null at n = 0. A median over nothing is not zero, and printing zero would be a claim. */
  readonly medianElapsedMs: number | null;
  readonly medianCostUsd: number | null;
  /** Ratios in 0..1, computed from the entries in hand. Never stored, never asserted as constants. */
  readonly successRate: number | null;
  readonly refusalRate: number | null;
  readonly timeoutRate: number | null;
  readonly totalCostUsd: number;
  /** How many entries were dropped because their vendor bars comparative publication. */
  readonly excludedUnpublishable: number;
  /** True when any entry was cleared by a face detector not validated for production use. */
  readonly anyNonProductionFaceCheck: boolean;
}

/** Average of the two middle values at even n. Null at n = 0 rather than a fabricated zero. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

const OUTCOMES: readonly AttemptOutcome[] = ["produced", "refused", "error", "timeout", "budget_exceeded"];
const MODALITIES: readonly ReproductionModality[] = ["text", "image", "website-from-screenshot"];

export interface AggregateOptions {
  /** Drop entries whose vendor bars comparative publication. Use for anything intended to be shown. */
  readonly publishableOnly?: boolean;
  readonly modality?: ReproductionModality;
}

export class SubstantiationLog {
  private readonly rows: SubstantiationEntry[] = [];

  /** Build an entry from an attempt plus the controls that ran in front of it. */
  record(params: {
    readonly requestId: string;
    readonly attempt: ReproductionAttempt;
    readonly artifactSha256: string;
    readonly artifactMediaType: string;
    readonly artifactByteLength: number;
    readonly consentId: string;
    readonly faceDetectorId: string;
    readonly faceDetectorProductionGrade: boolean;
    readonly publishableInComparisons: boolean;
  }): SubstantiationEntry {
    const a = params.attempt;
    const entry: SubstantiationEntry = {
      requestId: params.requestId,
      attemptId: a.attemptId,
      artifactSha256: params.artifactSha256,
      artifactMediaType: params.artifactMediaType,
      artifactByteLength: params.artifactByteLength,
      modality: a.modality,
      providerId: a.providerId,
      model: a.model,
      prompt: a.prompt,
      parameters: a.parameters,
      startedAt: a.startedAt,
      finishedAt: a.finishedAt,
      elapsedMs: a.elapsedMs,
      costUsd: a.costUsd,
      outcome: a.outcome,
      ...(a.refusalNote === undefined ? {} : { refusalNote: a.refusalNote }),
      ...(a.confounder === undefined ? {} : { confounder: a.confounder }),
      consentId: params.consentId,
      faceDetectorId: params.faceDetectorId,
      faceDetectorProductionGrade: params.faceDetectorProductionGrade,
      faceRegionsExcluded: a.faceRegionsExcluded === true,
      publishableInComparisons: params.publishableInComparisons,
    };
    this.rows.push(entry);
    return entry;
  }

  entries(): readonly SubstantiationEntry[] {
    return this.rows;
  }

  forRequest(requestId: string): readonly SubstantiationEntry[] {
    return this.rows.filter((r) => r.requestId === requestId);
  }

  aggregate(options: AggregateOptions = {}): SubstantiationAggregate {
    const all = options.modality === undefined ? this.rows : this.rows.filter((r) => r.modality === options.modality);
    const kept = options.publishableOnly === true ? all.filter((r) => r.publishableInComparisons) : all;
    const excludedUnpublishable = all.length - kept.length;

    const byModality = Object.fromEntries(
      MODALITIES.map((m) => [m, kept.filter((r) => r.modality === m).length]),
    ) as Record<ReproductionModality, number>;
    const byOutcome = Object.fromEntries(
      OUTCOMES.map((o) => [o, kept.filter((r) => r.outcome === o).length]),
    ) as Record<AttemptOutcome, number>;

    const n = kept.length;
    const rate = (count: number): number | null => (n === 0 ? null : count / n);
    return {
      n,
      byModality,
      byOutcome,
      medianElapsedMs: median(kept.map((r) => r.elapsedMs)),
      medianCostUsd: median(kept.map((r) => r.costUsd)),
      successRate: rate(byOutcome.produced),
      refusalRate: rate(byOutcome.refused),
      timeoutRate: rate(byOutcome.timeout),
      totalCostUsd: Math.round(kept.reduce((sum, r) => sum + r.costUsd, 0) * 10_000) / 10_000,
      excludedUnpublishable,
      anyNonProductionFaceCheck: kept.some((r) => !r.faceDetectorProductionGrade),
    };
  }
}

/**
 * Render an aggregate as text.
 *
 * Every line is a count or a computed ratio over a stated denominator. "3 of 7" and "a rate" are
 * different claims and only the first one is defensible, so the denominator is printed on every
 * line that has one, and a zero-entry aggregate prints "no attempts recorded" rather than a row of
 * zeroes that would read as a measurement.
 */
export function formatAggregate(a: SubstantiationAggregate): string {
  if (a.n === 0) return "SUBSTANTIATION\n  no attempts recorded, so no figure is stated";
  const ratio = (r: number | null, label: string, count: number): string =>
    r === null ? `  ${label}: not computed` : `  ${label}: ${count} of ${a.n} (${r.toFixed(3)})`;
  const lines = [
    "SUBSTANTIATION",
    `  attempts: ${a.n}`,
    `  by modality: ${MODALITIES.map((m) => `${m} ${a.byModality[m]}`).join(", ")}`,
    `  median elapsed: ${a.medianElapsedMs === null ? "not computed" : `${a.medianElapsedMs} ms`}`,
    `  median cost: ${a.medianCostUsd === null ? "not computed" : `$${a.medianCostUsd.toFixed(4)}`}`,
    ratio(a.successRate, "attempts that returned an output", a.byOutcome.produced),
    ratio(a.refusalRate, "declined by the provider", a.byOutcome.refused),
    ratio(a.timeoutRate, "aborted on the deadline", a.byOutcome.timeout),
    `  total spend: $${a.totalCostUsd.toFixed(4)}`,
  ];
  if (a.excludedUnpublishable > 0) {
    lines.push(`  excluded from this aggregate: ${a.excludedUnpublishable} attempt(s) whose vendor terms bar a published comparison`);
  }
  if (a.anyNonProductionFaceCheck) {
    lines.push("  note: at least one attempt was cleared by a face check not validated for production use");
  }
  return lines.join("\n");
}
