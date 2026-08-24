/**
 * Abstention accounting, shared by the three modality calibration suites.
 *
 * THE ABSTENTION RATE IS A HEADLINE PRODUCT METRIC, not a defect being tracked down. These
 * detectors read declarations. Most files declare nothing, and most files that reach anybody
 * over the internet have been re-encoded on the way. Both of those produce silence, and
 * silence is the honest output.
 *
 * It is computed here rather than written down anywhere, for the same reason no accuracy
 * figure is written down anywhere: a number in a source file is a claim held at the moment it
 * is made, and `packages/core/test/no-claims.test.ts` enforces that. The rate is printed by
 * every calibration run against the corpus that run actually used.
 */

import type { AbstentionCode, Report } from "@slop/core";

export interface AbstentionSummary {
  readonly total: number;
  readonly assessed: number;
  readonly inconclusive: number;
  readonly notAssessed: number;
  /** Share of members on which no score was reported. */
  readonly rate: number;
  readonly byCode: Readonly<Record<string, number>>;
}

export function summariseAbstention(reports: readonly Report[]): AbstentionSummary {
  const byCode: Record<string, number> = {};
  let assessed = 0;
  let inconclusive = 0;
  let notAssessed = 0;
  for (const report of reports) {
    if (report.status === "assessed") assessed += 1;
    if (report.status === "inconclusive") inconclusive += 1;
    if (report.status === "not_assessed") notAssessed += 1;
    for (const reason of report.abstention) byCode[reason.code] = (byCode[reason.code] ?? 0) + 1;
  }
  const total = reports.length;
  return {
    total,
    assessed,
    inconclusive,
    notAssessed,
    rate: total === 0 ? 0 : (total - assessed) / total,
    byCode,
  };
}

/** A table for the run log. The point of a calibration run is to be READ, not just to be green. */
export function formatAbstention(name: string, summary: AbstentionSummary): string {
  const pct = (n: number): string => `${Math.round((n / Math.max(1, summary.total)) * 1000) / 10}%`;
  const codes = Object.entries(summary.byCode)
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => `    ${code.padEnd(26)} ${String(n).padStart(3)}  ${pct(n)}`)
    .join("\n");
  return [
    `${name}: abstention accounting over ${summary.total} corpus member(s)`,
    `  scored        ${String(summary.assessed).padStart(3)}  ${pct(summary.assessed)}`,
    `  inconclusive  ${String(summary.inconclusive).padStart(3)}  ${pct(summary.inconclusive)}`,
    `  not assessed  ${String(summary.notAssessed).padStart(3)}  ${pct(summary.notAssessed)}`,
    `  ABSTAINED     ${String(summary.total - summary.assessed).padStart(3)}  ${pct(summary.total - summary.assessed)}`,
    codes ? `  by coded reason:\n${codes}` : "  by coded reason: (none)",
  ].join("\n");
}

/** Every abstention code the media detectors are allowed to produce. */
export const MEDIA_ABSTENTION_CODES: readonly AbstentionCode[] = [
  "artifact_re_encoded",
  "no_declared_provenance",
  "coverage_below_floor",
  "probe_failed",
  "single_family_only",
  "cannot_fetch",
];
