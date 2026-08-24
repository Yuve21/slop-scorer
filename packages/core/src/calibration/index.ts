/**
 * Calibration: the part of the product that measures the product.
 *
 * WHY THIS IS SOURCE CODE AND NOT A SPREADSHEET
 *
 * *In re Workado* (FTC, 2026) is a consent order over a 98%-accuracy claim for an
 * AI-content detector. The counts the FTC pleaded are, in order: the respondent did not
 * build the model, did not test it on the use cases it advertised, and could not produce
 * substantiation on request. Any accuracy number this product states is therefore a
 * substantiation-bearing claim under FTC Act s5, and the only defensible way to hold one is
 * to compute it, from a named corpus, at test time, every time the corpus or the rules move.
 *
 * So: no accuracy figure is written down anywhere in this repository. There is a corpus, a
 * harness, and an assertion. The number is an output, never an input. `no-claims.test.ts`
 * enforces that by scanning the source and the READMEs for hardcoded accuracy figures.
 *
 * WHAT THE HARNESS IS FOR
 *
 * A rule change that starts flagging human work is invisible in unit tests. Every rule can
 * pass its own fixtures while the ensemble drifts, because the ensemble is the thing that
 * ships. `runCalibration` scores a labeled corpus and `assertNegativeCorpus` fails the build
 * when a known-human artifact crosses into a band the product would print as a finding.
 *
 * The negative set is small and it is honest about being small: five labeled human artifacts
 * cannot establish a false-positive RATE and this module never claims one. What five
 * artifacts can do is act as a regression tripwire, which is the job.
 */

import type { Band } from "../config.js";
import type { AssessmentStatus } from "../assessment.js";
import type { Report } from "../score.js";

/** Ground truth for one corpus member. `unknown` members are carried but never asserted on. */
export type CorpusLabel = "human" | "generated" | "unknown";

/**
 * A labeled artifact.
 *
 * `provenance` is mandatory and it is the reason the corpus is defensible: a label with no
 * stated basis is an assertion, and an assertion is what got Workado its consent order. Each
 * member says how we know, in a sentence a third party can go and check.
 */
export interface CorpusCase<A> {
  readonly id: string;
  readonly label: CorpusLabel;
  /** Where the artifact came from. A URL, a repo, a commit. */
  readonly source: string;
  /** HOW WE KNOW the label. Funding round, named designer, purchase receipt, our own build. */
  readonly provenance: string;
  /** Captured observations, replayed offline. No network in a calibration run. */
  readonly artifact: A;
  /** Captured at, so a drifted artifact can be told apart from a drifted rule. */
  readonly capturedAt: string;
}

export interface CalibrationRow {
  readonly id: string;
  readonly label: CorpusLabel;
  readonly source: string;
  readonly status: AssessmentStatus;
  readonly score: number | null;
  readonly band: Band | null;
  readonly coverage: number;
  readonly familiesFired: number;
  /** Rule ids that fired, so a regression names the rule that caused it. */
  readonly firedRules: readonly string[];
}

export interface Distribution {
  readonly n: number;
  readonly scored: number;
  readonly abstained: number;
  readonly min: number | null;
  readonly max: number | null;
  readonly mean: number | null;
  readonly median: number | null;
  readonly byBand: Readonly<Record<string, number>>;
}

export interface CalibrationReport {
  readonly corpusVersion: string;
  readonly rows: readonly CalibrationRow[];
  readonly byLabel: Readonly<Record<CorpusLabel, Distribution>>;
}

const BAND_ORDER: readonly Band[] = ["few-signals", "some-signals", "many-signals", "heavy-template-signature"];

/** Index of a band on the ladder. -1 for an abstention, which is below every band. */
export const bandRank = (band: Band | null): number => (band === null ? -1 : BAND_ORDER.indexOf(band));

function distribution(rows: readonly CalibrationRow[]): Distribution {
  const scores = rows.map((r) => r.score).filter((s): s is number => s !== null);
  const sorted = [...scores].sort((a, b) => a - b);
  const byBand: Record<string, number> = {};
  for (const r of rows) {
    const key = r.band ?? r.status;
    byBand[key] = (byBand[key] ?? 0) + 1;
  }
  const mid = Math.floor(sorted.length / 2);
  return {
    n: rows.length,
    scored: scores.length,
    abstained: rows.length - scores.length,
    min: sorted[0] ?? null,
    max: sorted[sorted.length - 1] ?? null,
    mean: scores.length === 0 ? null : scores.reduce((a, b) => a + b, 0) / scores.length,
    median:
      sorted.length === 0
        ? null
        : sorted.length % 2 === 1
          ? sorted[mid]!
          : ((sorted[mid - 1]! + sorted[mid]!) / 2),
    byBand,
  };
}

/** Score a labeled corpus. Pure and offline: the caller supplies the scoring function. */
export function runCalibration<A>(
  corpusVersion: string,
  cases: readonly CorpusCase<A>[],
  score: (artifact: A, id: string) => Report,
): CalibrationReport {
  const rows: CalibrationRow[] = cases.map((c) => {
    const report = score(c.artifact, c.id);
    return {
      id: c.id,
      label: c.label,
      source: c.source,
      status: report.status,
      score: report.score,
      band: report.band,
      coverage: report.coverage.ratio,
      familiesFired: report.familiesFired,
      firedRules: report.receipt.lines.filter((l) => l.polarity === "signal").map((l) => l.ruleId),
    };
  });
  return {
    corpusVersion,
    rows,
    byLabel: {
      human: distribution(rows.filter((r) => r.label === "human")),
      generated: distribution(rows.filter((r) => r.label === "generated")),
      unknown: distribution(rows.filter((r) => r.label === "unknown")),
    },
  };
}

export interface NegativeViolation {
  readonly id: string;
  readonly source: string;
  readonly band: Band | null;
  readonly score: number | null;
  readonly firedRules: readonly string[];
  readonly message: string;
}

/**
 * The tripwire.
 *
 * Every `human`-labeled member must land strictly BELOW `maxBand`. A violation names the
 * artifact, the band, the score and every rule that fired, because the useful output of a
 * calibration failure is not "we regressed", it is "css.crushed-tracking started firing on
 * a site a person designed".
 *
 * An abstention on a human artifact is not a violation. Refusing to score a page we could
 * not read is the correct behaviour and must not be punished into a score.
 */
export function checkNegativeCorpus(
  report: CalibrationReport,
  maxBand: Band,
): readonly NegativeViolation[] {
  const ceiling = bandRank(maxBand);
  return report.rows
    .filter((r) => r.label === "human" && bandRank(r.band) >= ceiling)
    .map((r) => ({
      id: r.id,
      source: r.source,
      band: r.band,
      score: r.score,
      firedRules: r.firedRules,
      message:
        `${r.id} (${r.source}) is a known-human artifact and scored ${r.score} in band "${r.band}", ` +
        `at or above the "${maxBand}" ceiling. Rules that fired: ${r.firedRules.join(", ") || "(none)"}. ` +
        `A rule change has started flagging work a person made.`,
    }));
}

/** Throwing form, for use as a test assertion. */
export function assertNegativeCorpus(report: CalibrationReport, maxBand: Band): void {
  const violations = checkNegativeCorpus(report, maxBand);
  if (violations.length > 0) {
    throw new Error(
      `Negative corpus regression: ${violations.length} known-human artifact(s) reached "${maxBand}" or above.\n` +
        violations.map((v) => `  - ${v.message}`).join("\n"),
    );
  }
}

/**
 * Render the calibration table.
 *
 * Printed by the test run so the distribution is visible in CI output rather than buried in
 * an assertion. This is the only place a measured number is allowed to appear, and it
 * appears with the corpus version and the sample size next to it.
 */
export function formatCalibration(report: CalibrationReport): string {
  const out: string[] = [];
  out.push(`CALIBRATION  corpus ${report.corpusVersion}`);
  out.push(`  ${"artifact".padEnd(22)}${"label".padEnd(10)}${"status".padEnd(14)}${"score".padEnd(7)}band`);
  for (const r of [...report.rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))) {
    out.push(
      `  ${r.id.padEnd(22)}${r.label.padEnd(10)}${r.status.padEnd(14)}${String(r.score ?? "-").padEnd(7)}${
        r.band ?? "-"
      }`,
    );
  }
  for (const label of ["human", "generated"] as const) {
    const d = report.byLabel[label];
    if (d.n === 0) continue;
    out.push(
      `  ${label}: n=${d.n} scored=${d.scored} abstained=${d.abstained} min=${d.min ?? "-"} median=${
        d.median ?? "-"
      } max=${d.max ?? "-"}`,
    );
  }
  out.push(
    `  Sample sizes this small are a regression tripwire, not a false-positive rate. No rate is claimed.`,
  );
  return out.join("\n");
}
