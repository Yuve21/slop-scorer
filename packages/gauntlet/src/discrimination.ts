/**
 * The output the whole game exists to produce.
 *
 * This is the credibility moat, stated plainly: every competitor returns a confident number and
 * publishes no error rate. We publish, per artifact, "our score was X, and of M people who saw this
 * artifact as the human-made one in a round, N found it". That second half cannot be bought, cannot
 * be scraped, and gets stronger every day the game runs.
 *
 * THREE RULES, all enforced below rather than remembered.
 *
 *  1. NO RATE UNDER THE MINIMUM SAMPLE. A rate over eleven guesses is not a measurement. Under the
 *     threshold this module returns `null` and the formatter prints the counts and the word "not
 *     computed", which is the same discipline as `formatCalibration` printing its sample size next
 *     to every distribution.
 *  2. EVERY RATE SHIPS WITH AN INTERVAL. A Wilson score interval, because the normal approximation
 *     is badly wrong exactly where this data lives (small n, proportions near 0 or 1). A point
 *     estimate with no interval is how a detector ends up advertising 98%.
 *  3. TIMING FIGURES COME ONLY FROM SERVER-MEASURED ROWS. A guess whose client-reported duration
 *     disagreed with ours is counted in the correctness numbers and excluded from the timing ones.
 *
 * And the rule inherited from `packages/core/src/calibration`: no figure in this file is a
 * constant. Everything is computed from rows, at call time, from a named corpus version.
 */

import type { ArtifactLabel, DiscriminationRow, SubstantiationRunRow } from "@slop/db";

/**
 * Below this, a rate is not computed.
 *
 * Thirty is a threshold, not a discovery: it is the point where a Wilson interval on a proportion
 * stops being wider than the thing it is estimating. It is a constant because it is a POLICY, and a
 * policy that lives in a variable at the call site is a policy somebody lowers for a launch.
 */
export const MINIMUM_SAMPLE = 30 as const;

export interface Interval {
  readonly low: number;
  readonly high: number;
}

/**
 * Wilson score interval at 95%.
 *
 * `z = 1.959964` rather than 1.96, because the rounded constant shifts the bound in the third
 * decimal, and the third decimal is exactly where somebody will quote it.
 */
export function wilson(successes: number, trials: number, z = 1.959964): Interval | null {
  if (trials <= 0) return null;
  const p = successes / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const centre = p + z2 / (2 * trials);
  const spread = z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials));
  return {
    low: Math.max(0, (centre - spread) / denominator),
    high: Math.min(1, (centre + spread) / denominator),
  };
}

export interface ArtifactStat {
  readonly artifactId: string;
  readonly corpus: string;
  readonly label: ArtifactLabel;
  /** Cited in the published table. This is the audience that is entitled to the provenance. */
  readonly source: string;
  readonly provenance: string;
  readonly timesShown: number;
  readonly timesChosenAsHuman: number;
  readonly timesWasTheAnswer: number;
  readonly timesAnswerFound: number;
  /**
   * For a human-made artifact: of the rounds where it WAS the answer, how often people found it.
   * Null under the minimum sample, and null for a generated artifact, which is never the answer.
   */
  readonly humanDiscriminationRate: number | null;
  readonly humanDiscriminationInterval: Interval | null;
  /**
   * For a generated artifact: how often it was mistaken for the human-made one. The other half of
   * the same story, and the more interesting half - a generated artifact people keep picking is a
   * generator that has gotten good.
   */
  readonly mistakenForHumanRate: number | null;
  readonly mistakenForHumanInterval: Interval | null;
  readonly medianElapsedMs: number | null;
  readonly belowMinimumSample: boolean;
}

export interface CalibrationExport {
  readonly corpusVersion: string;
  readonly minimumSample: number;
  readonly computedAt: string;
  readonly artifacts: readonly ArtifactStat[];
  /** Pooled across every human-made artifact that met the minimum. Null when none did. */
  readonly overallHumanDiscrimination: {
    readonly found: number;
    readonly trials: number;
    readonly rate: number | null;
    readonly interval: Interval | null;
    readonly artifactsIncluded: number;
    readonly artifactsBelowMinimum: number;
  };
}

export interface SummarizeOptions {
  readonly minimumSample?: number;
  readonly corpusVersion: string;
  readonly computedAt: string;
}

export function summarize(rows: readonly DiscriminationRow[], options: SummarizeOptions): CalibrationExport {
  const minimum = options.minimumSample ?? MINIMUM_SAMPLE;

  const artifacts: ArtifactStat[] = rows.map((r) => {
    const isHuman = r.label === "human";
    const answerTrials = r.timesWasTheAnswer;
    const shown = r.timesShown;
    const enoughAsAnswer = answerTrials >= minimum;
    const enoughShown = shown >= minimum;
    return {
      artifactId: r.artifactId,
      corpus: r.corpus,
      label: r.label,
      source: r.source,
      provenance: r.provenance,
      timesShown: shown,
      timesChosenAsHuman: r.timesChosenAsHuman,
      timesWasTheAnswer: answerTrials,
      timesAnswerFound: r.timesAnswerFound,
      humanDiscriminationRate: isHuman && enoughAsAnswer ? r.timesAnswerFound / answerTrials : null,
      humanDiscriminationInterval: isHuman && enoughAsAnswer ? wilson(r.timesAnswerFound, answerTrials) : null,
      mistakenForHumanRate: !isHuman && enoughShown ? r.timesChosenAsHuman / shown : null,
      mistakenForHumanInterval: !isHuman && enoughShown ? wilson(r.timesChosenAsHuman, shown) : null,
      medianElapsedMs: r.medianElapsedMs,
      belowMinimumSample: isHuman ? !enoughAsAnswer : !enoughShown,
    };
  });

  const humans = artifacts.filter((a) => a.label === "human");
  const included = humans.filter((a) => a.timesWasTheAnswer >= minimum);
  const found = included.reduce((s, a) => s + a.timesAnswerFound, 0);
  const trials = included.reduce((s, a) => s + a.timesWasTheAnswer, 0);

  return {
    corpusVersion: options.corpusVersion,
    minimumSample: minimum,
    computedAt: options.computedAt,
    artifacts,
    overallHumanDiscrimination: {
      found,
      trials,
      rate: trials >= minimum ? found / trials : null,
      interval: trials >= minimum ? wilson(found, trials) : null,
      artifactsIncluded: included.length,
      artifactsBelowMinimum: humans.length - included.length,
    },
  };
}

/**
 * Render the table.
 *
 * Counts before rates on every line, and the denominator always visible. "61 of 88 (0.693)" and
 * "69%" are different claims and only the first is checkable, which is the same rule
 * `formatAggregate` follows in the reproduction package.
 */
export function formatCalibrationExport(x: CalibrationExport): string {
  const pct = (r: number | null): string => (r === null ? "not computed" : r.toFixed(3));
  const iv = (i: Interval | null): string => (i === null ? "" : ` [${i.low.toFixed(3)}, ${i.high.toFixed(3)}]`);
  const out: string[] = [];
  out.push(`HUMAN DISCRIMINATION  corpus ${x.corpusVersion}  computed ${x.computedAt}`);
  out.push(`  minimum sample before any rate is stated: ${x.minimumSample}`);
  for (const a of [...x.artifacts].sort((p, q) => q.timesShown - p.timesShown)) {
    if (a.label === "human") {
      out.push(
        `  ${a.artifactId.padEnd(24)}human      found ${a.timesAnswerFound} of ${a.timesWasTheAnswer}` +
          `  ${pct(a.humanDiscriminationRate)}${iv(a.humanDiscriminationInterval)}`,
      );
    } else {
      out.push(
        `  ${a.artifactId.padEnd(24)}generated  picked ${a.timesChosenAsHuman} of ${a.timesShown}` +
          `  ${pct(a.mistakenForHumanRate)}${iv(a.mistakenForHumanInterval)}`,
      );
    }
  }
  const o = x.overallHumanDiscrimination;
  out.push(
    `  pooled: ${o.found} of ${o.trials} across ${o.artifactsIncluded} artifact(s)  ${pct(o.rate)}${iv(o.interval)}`,
  );
  if (o.artifactsBelowMinimum > 0) {
    out.push(
      `  excluded from the pooled figure: ${o.artifactsBelowMinimum} human artifact(s) below the minimum sample`,
    );
  }
  out.push(
    `  Every figure above is computed from the guesses in hand at ${x.computedAt}. None is stored as a constant.`,
  );
  return out.join("\n");
}

/**
 * Package an export as a substantiation row.
 *
 * Unpublished by default. A row is evidence; a published row is a claim, and the transition is a
 * deliberate act with a person behind it, which is why `publishedAt` is not set here.
 */
export function toSubstantiationRun(
  x: CalibrationExport,
  meta: { readonly runId: string; readonly producedBy: string },
): SubstantiationRunRow {
  return {
    runId: meta.runId,
    kind: "gauntlet-discrimination",
    corpusVersion: x.corpusVersion,
    sampleSize: x.overallHumanDiscrimination.trials,
    minimumSample: x.minimumSample,
    payload: x,
    producedBy: meta.producedBy,
    computedAt: x.computedAt,
    publishedAt: null,
    supersededBy: null,
  };
}
