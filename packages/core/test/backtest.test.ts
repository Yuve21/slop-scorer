import { describe, expect, it } from "vitest";
import { backtest, formatBacktest, makeBaseline, toBaselineEntries } from "@slop/core";
import type { Baseline, BaselineEntry, CalibrationReport } from "@slop/core";

/**
 * The gate that guards the corpora, guarded itself.
 *
 * A backtest nobody has watched go red is a green tick with no mechanism behind it, which is
 * the same failure the rest of this repository exists to prevent one level down. Every check
 * below is mutation-shaped: take a passing run, break exactly one thing, and require the
 * verdict to flip and the message to NAME what broke.
 */

const entry = (over: Partial<BaselineEntry> = {}): BaselineEntry => ({
  id: "overtone",
  corpus: "web",
  label: "human",
  status: "assessed",
  score: 4,
  band: "few-signals",
  firedRules: ["css.large-display-type"],
  ...over,
});

const baselineOf = (entries: readonly BaselineEntry[]): Baseline =>
  makeBaseline("2026-08-24T00:00:00.000Z", { web: "corpus-2026.09" }, { web: 15 }, entries);

describe("the backtest gate", () => {
  it("passes when nothing moved", () => {
    const base = baselineOf([entry(), entry({ id: "scaffold", label: "generated", score: 91, band: "heavy-template-signature" })]);
    const result = backtest(base, base.entries);
    expect(result.verdict).toBe("pass");
    expect(result.failures).toEqual([]);
    expect(formatBacktest(result, base)).toContain("PASS");
  });

  it("fails, and names the rule, when a human negative moves up a band", () => {
    const base = baselineOf([entry()]);
    const result = backtest(base, [
      entry({ score: 48, band: "some-signals", firedRules: ["css.large-display-type", "css.crushed-tracking"] }),
    ]);
    expect(result.verdict).toBe("fail");
    expect(result.failures.join(" ")).toContain("moved UP a band");
    expect(result.failures.join(" "), "the failure must name the rule that started firing").toContain(
      "css.crushed-tracking",
    );
    expect(result.rows[0]?.rulesGained).toEqual(["css.crushed-tracking"]);
  });

  it("fails when a human negative crosses the base rate without changing band", () => {
    // The band ladder is coarse. A negative can go from 2 to 40 inside one band, which is the
    // product being 20 points more suspicious of a person's work with nothing to show for it.
    const base = baselineOf([entry({ score: 4 })]);
    const result = backtest(base, [entry({ score: 40 })]);
    expect(result.verdict).toBe("fail");
    expect(result.failures.join(" ")).toContain("crossed the base rate of 15");
  });

  it("does not fail when a human negative moves DOWN", () => {
    const base = baselineOf([entry({ score: 14 })]);
    const result = backtest(base, [entry({ score: 2, firedRules: [] })]);
    expect(result.verdict).toBe("pass");
    expect(result.rows[0]?.delta).toBe(-12);
    expect(result.rows[0]?.rulesLost).toEqual(["css.large-display-type"]);
  });

  it("fails when a generated positive falls a band, which is how a corpus goes dead quietly", () => {
    const base = baselineOf([
      entry({ id: "scaffold", label: "generated", score: 91, band: "heavy-template-signature", firedRules: ["a", "b"] }),
    ]);
    const result = backtest(base, [
      entry({ id: "scaffold", label: "generated", score: 55, band: "many-signals", firedRules: ["a"] }),
    ]);
    expect(result.verdict).toBe("fail");
    expect(result.failures.join(" ")).toContain("moved DOWN a band");
    expect(result.failures.join(" ")).toContain("b");
  });

  it("fails when a corpus member disappears", () => {
    const base = baselineOf([entry(), entry({ id: "rodeo" })]);
    const result = backtest(base, [entry()]);
    expect(result.verdict).toBe("fail");
    expect(result.failures.join(" ")).toContain("web/rodeo");
    expect(result.removed).toEqual(["web/rodeo"]);
  });

  it("reports a new member without failing on it", () => {
    const base = baselineOf([entry()]);
    const result = backtest(base, [entry(), entry({ id: "amata" })]);
    expect(result.verdict).toBe("pass");
    expect(result.added).toEqual(["web/amata"]);
    expect(formatBacktest(result, base)).toContain("new members");
  });

  it("builds baseline entries from a calibration report with the rules sorted", () => {
    const report: CalibrationReport = {
      corpusVersion: "corpus-2026.09",
      rows: [
        {
          id: "rodeo",
          label: "human",
          source: "rodeo.com",
          status: "assessed",
          score: 6,
          band: "few-signals",
          coverage: 1,
          familiesFired: 1,
          firedRules: ["z.rule", "a.rule"],
        },
      ],
      byLabel: {
        human: { n: 1, scored: 1, abstained: 0, min: 6, max: 6, mean: 6, median: 6, byBand: {} },
        generated: { n: 0, scored: 0, abstained: 0, min: null, max: null, mean: null, median: null, byBand: {} },
        unknown: { n: 0, scored: 0, abstained: 0, min: null, max: null, mean: null, median: null, byBand: {} },
      },
    };
    expect(toBaselineEntries("web", report)[0]?.firedRules).toEqual(["a.rule", "z.rule"]);
  });
});
