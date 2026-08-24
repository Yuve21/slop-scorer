/**
 * Backtesting: no rule ships until it has been replayed against the frozen corpora.
 *
 * THE DISCIPLINE THIS ENCODES
 *
 * Radar's published practice is that a rule change is replayed against a frozen labeled set
 * and the per-artifact delta is inspected before it ships. The reason is not thoroughness, it
 * is that a rule change is invisible in unit tests by construction: every rule passes its own
 * fixtures while the ENSEMBLE drifts, and the ensemble is the thing that scores a stranger's
 * repository. A reweighting that moves one human negative up a band is a product incident,
 * and it looks exactly like a green test run.
 *
 * So this module answers one question: what did this change do to every artifact we have a
 * label for? It prints the answer per artifact, before and after, and it FAILS on the two
 * outcomes that must never ship silently:
 *
 *   1. A human negative crossed into a higher band, or rose above the base rate. That is the
 *      product accusing someone it did not accuse yesterday.
 *   2. A generated positive fell a band. That is the corpus quietly going dead, which is the
 *      failure that passes every negative test in the suite.
 *
 * Everything else is reported and allowed: scores move when rules improve, and a discipline
 * that forbids all movement is a discipline nobody follows.
 *
 * The baseline is a committed file. Updating it is a deliberate act with a diff a reviewer
 * can read, which is the whole point: the number in the file is the claim, and the claim is
 * reviewable.
 */

import type { Band } from "../config.js";
import type { AssessmentStatus } from "../assessment.js";
import { bandRank } from "./index.js";
import type { CalibrationReport, CorpusLabel } from "./index.js";

export const BASELINE_FORMAT_VERSION = 1 as const;

export interface BaselineEntry {
  readonly id: string;
  readonly corpus: string;
  readonly label: CorpusLabel;
  readonly status: AssessmentStatus;
  readonly score: number | null;
  readonly band: Band | null;
  /** Sorted, so a diff of the file is legible and a reordering is not a change. */
  readonly firedRules: readonly string[];
}

export interface Baseline {
  readonly formatVersion: typeof BASELINE_FORMAT_VERSION;
  readonly recordedAt: string;
  /** Corpus version per detector, so "the rules moved" and "the corpus moved" stay distinct. */
  readonly corpusVersions: Readonly<Record<string, string>>;
  /** The base rate each corpus was scored against. A human negative above it is a regression. */
  readonly baseRates: Readonly<Record<string, number>>;
  readonly entries: readonly BaselineEntry[];
}

export type BacktestVerdict = "pass" | "fail";

export interface BacktestRow {
  readonly id: string;
  readonly corpus: string;
  readonly label: CorpusLabel;
  readonly before: number | null;
  readonly after: number | null;
  readonly delta: number | null;
  readonly bandBefore: Band | null;
  readonly bandAfter: Band | null;
  readonly bandMoved: "up" | "down" | "same";
  /** Rules that fired now and did not before, and the reverse. The actionable half. */
  readonly rulesGained: readonly string[];
  readonly rulesLost: readonly string[];
  readonly failures: readonly string[];
}

export interface BacktestResult {
  readonly verdict: BacktestVerdict;
  readonly rows: readonly BacktestRow[];
  /** Members present in one side only. A corpus that shrank silently is a regression too. */
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly failures: readonly string[];
}

/** Flatten a calibration run into baseline entries. */
export function toBaselineEntries(corpus: string, report: CalibrationReport): BaselineEntry[] {
  return report.rows.map((r) => ({
    id: r.id,
    corpus,
    label: r.label,
    status: r.status,
    score: r.score,
    band: r.band,
    firedRules: [...r.firedRules].sort(),
  }));
}

export function makeBaseline(
  now: string,
  corpusVersions: Readonly<Record<string, string>>,
  baseRates: Readonly<Record<string, number>>,
  entries: readonly BaselineEntry[],
): Baseline {
  return {
    formatVersion: BASELINE_FORMAT_VERSION,
    recordedAt: now,
    corpusVersions,
    baseRates,
    entries: [...entries].sort((a, b) => a.corpus.localeCompare(b.corpus) || a.id.localeCompare(b.id)),
  };
}

const key = (e: { corpus: string; id: string }): string => `${e.corpus}/${e.id}`;

/**
 * Compare a fresh run against the committed baseline.
 *
 * Pure, so the harness that decides pass or fail is itself unit-tested with a synthetic
 * regression rather than trusted. A gate nobody has watched go red is not a gate.
 */
export function backtest(baseline: Baseline, current: readonly BaselineEntry[]): BacktestResult {
  const before = new Map(baseline.entries.map((e) => [key(e), e]));
  const after = new Map(current.map((e) => [key(e), e]));

  const rows: BacktestRow[] = [];
  const failures: string[] = [];

  for (const [k, now] of after) {
    const was = before.get(k);
    if (!was) continue;
    const bandMove = bandRank(now.band) - bandRank(was.band);
    const rulesGained = now.firedRules.filter((r) => !was.firedRules.includes(r));
    const rulesLost = was.firedRules.filter((r) => !now.firedRules.includes(r));
    const rowFailures: string[] = [];

    if (now.label === "human") {
      const baseRate = baseline.baseRates[now.corpus] ?? Number.POSITIVE_INFINITY;
      if (bandMove > 0) {
        rowFailures.push(
          `${k} is known-human work and moved UP a band, from "${was.band}" to "${now.band}" (${was.score} -> ${now.score}). ` +
            `Rules newly firing on it: ${rulesGained.join(", ") || "(none, so a weight moved)"}.`,
        );
      }
      if ((now.score ?? 0) > baseRate && (was.score ?? 0) <= baseRate) {
        rowFailures.push(
          `${k} is known-human work and crossed the base rate of ${baseRate}, from ${was.score} to ${now.score}. ` +
            `Rules newly firing on it: ${rulesGained.join(", ") || "(none, so a weight moved)"}.`,
        );
      }
    }
    if (now.label === "generated" && bandMove < 0) {
      rowFailures.push(
        `${k} is a generated artifact and moved DOWN a band, from "${was.band}" to "${now.band}" (${was.score} -> ${now.score}). ` +
          `Rules that stopped firing: ${rulesLost.join(", ") || "(none, so a weight moved)"}. A corpus that stops firing ` +
          `passes every negative test in the suite.`,
      );
    }

    failures.push(...rowFailures);
    rows.push({
      id: now.id,
      corpus: now.corpus,
      label: now.label,
      before: was.score,
      after: now.score,
      delta: was.score === null || now.score === null ? null : now.score - was.score,
      bandBefore: was.band,
      bandAfter: now.band,
      bandMoved: bandMove > 0 ? "up" : bandMove < 0 ? "down" : "same",
      rulesGained,
      rulesLost,
      failures: rowFailures,
    });
  }

  const added = [...after.keys()].filter((k) => !before.has(k)).sort();
  const removed = [...before.keys()].filter((k) => !after.has(k)).sort();
  if (removed.length > 0) {
    // A corpus member that vanished takes its tripwire with it, and the run would otherwise
    // get quieter and greener at the same time.
    failures.push(
      `${removed.length} corpus member(s) disappeared since the baseline: ${removed.join(", ")}. ` +
        `Either restore them or update the baseline deliberately.`,
    );
  }

  return {
    verdict: failures.length === 0 ? "pass" : "fail",
    rows: rows.sort((a, b) => a.corpus.localeCompare(b.corpus) || a.id.localeCompare(b.id)),
    added,
    removed,
    failures,
  };
}

const sign = (n: number | null): string => (n === null ? "  -  " : n > 0 ? `+${n}` : `${n}`);

/** The printed delta. This output is the artifact a reviewer reads before a rule ships. */
export function formatBacktest(result: BacktestResult, baseline: Baseline): string {
  const out: string[] = [];
  out.push(`BACKTEST  against baseline recorded ${baseline.recordedAt}`);
  for (const [corpus, version] of Object.entries(baseline.corpusVersions)) {
    out.push(`  ${corpus}: corpus ${version}, base rate ${baseline.baseRates[corpus] ?? "?"}`);
  }
  out.push("");
  out.push(`  ${"artifact".padEnd(28)}${"label".padEnd(10)}${"before".padEnd(8)}${"after".padEnd(8)}${"delta".padEnd(8)}band`);
  for (const r of result.rows) {
    const band = r.bandMoved === "same" ? (r.bandAfter ?? "-") : `${r.bandBefore ?? "-"} -> ${r.bandAfter ?? "-"}`;
    out.push(
      `  ${`${r.corpus}/${r.id}`.padEnd(28)}${r.label.padEnd(10)}${String(r.before ?? "-").padEnd(8)}${String(
        r.after ?? "-",
      ).padEnd(8)}${sign(r.delta).padEnd(8)}${band}${r.bandMoved === "up" ? "   BAND UP" : ""}`,
    );
    if (r.rulesGained.length > 0) out.push(`      + ${r.rulesGained.join(", ")}`);
    if (r.rulesLost.length > 0) out.push(`      - ${r.rulesLost.join(", ")}`);
  }
  out.push("");
  if (result.added.length > 0) out.push(`  new members (no baseline yet): ${result.added.join(", ")}`);
  if (result.failures.length === 0) {
    out.push("  PASS. No human negative moved up a band or crossed the base rate; nothing generated fell a band.");
  } else {
    out.push(`  FAIL. ${result.failures.length} blocking change(s):`);
    for (const f of result.failures) out.push(`    - ${f}`);
  }
  return out.join("\n");
}
