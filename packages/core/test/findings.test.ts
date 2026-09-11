/**
 * The finding-level gate is about to become the only instrument that says whether a rule change
 * made the corpus better. A gate in that position gets its own failure modes exercised, not just
 * its happy path, because a gate that cannot fail is the thing this product exists to detect.
 */
import { describe, expect, it } from "vitest";
import { findingBacktest, formatFindingBacktest } from "../src/calibration/findings.js";
import { BASELINE_FORMAT_VERSION, type Baseline, type BaselineEntry } from "../src/calibration/backtest.js";

const entry = (over: Partial<BaselineEntry> & { id: string }): BaselineEntry => ({
  corpus: "web",
  label: "human",
  status: "assessed",
  score: 3,
  band: "few-signals",
  firedRules: [],
  ...over,
});

const baselineOf = (entries: BaselineEntry[]): Baseline => ({
  formatVersion: BASELINE_FORMAT_VERSION,
  recordedAt: "2026-09-11T00:00:00.000Z",
  corpusVersions: { web: "corpus-2026.09" },
  baseRates: { web: 15 },
  entries,
});

const HUMAN = entry({ id: "hand-written-page", label: "human", firedRules: [] });
const GENERATED = entry({ id: "declares-its-generator", label: "generated", firedRules: ["meta-generator"] });

describe("findingBacktest", () => {
  it("passes when no rule changed which artifacts it fires on", () => {
    const r = findingBacktest(baselineOf([HUMAN, GENERATED]), [HUMAN, GENERATED]);
    expect(r.verdict).toBe("pass");
    expect(r.failures).toEqual([]);
    expect(r.humanCompared).toBe(1);
    expect(r.generatedCompared).toBe(1);
  });

  it("FAILS when a rule newly fires on verified human work", () => {
    const r = findingBacktest(baselineOf([HUMAN, GENERATED]), [
      { ...HUMAN, firedRules: ["uniform-section-rhythm"] },
      GENERATED,
    ]);
    expect(r.verdict).toBe("fail");
    expect(r.failures.join(" ")).toContain("uniform-section-rhythm");
    expect(r.failures.join(" ")).toContain("new false positive");
    // The rule is named with the artifact, because "a false positive appeared" is not actionable.
    expect(r.rules.find((x) => x.ruleId === "uniform-section-rhythm")?.newOnHuman).toEqual(["web/hand-written-page"]);
  });

  it("FAILS when a rule stops firing on generated work", () => {
    const r = findingBacktest(baselineOf([HUMAN, GENERATED]), [HUMAN, { ...GENERATED, firedRules: [] }]);
    expect(r.verdict).toBe("fail");
    expect(r.failures.join(" ")).toContain("lost recall");
    expect(r.rules.find((x) => x.ruleId === "meta-generator")?.lostOnGenerated).toEqual([
      "web/declares-its-generator",
    ]);
  });

  it("does not fail on movement over an unknown-labelled member, and still reports it", () => {
    const UNKNOWN = entry({ id: "unlabelled", label: "unknown", firedRules: [] });
    const r = findingBacktest(baselineOf([HUMAN, GENERATED, UNKNOWN]), [
      HUMAN,
      GENERATED,
      { ...UNKNOWN, firedRules: ["uniform-section-rhythm"] },
    ]);
    expect(r.verdict).toBe("pass");
    expect(r.rules.find((x) => x.ruleId === "uniform-section-rhythm")?.movedOnUnknown).toEqual(["web/unlabelled"]);
    expect(formatFindingBacktest(r)).toContain("moved on unknown");
  });

  it("FAILS when a corpus member disappears, because a shrinking corpus hides false positives", () => {
    const r = findingBacktest(baselineOf([HUMAN, GENERATED]), [GENERATED]);
    expect(r.verdict).toBe("fail");
    expect(r.failures.join(" ")).toContain("web/hand-written-page");
    expect(r.removed).toEqual(["web/hand-written-page"]);
  });

  it("reports a new member without failing on it, since it has nothing to have moved against", () => {
    const NEW = entry({ id: "captured-today", label: "human", firedRules: ["uniform-section-rhythm"] });
    const r = findingBacktest(baselineOf([HUMAN, GENERATED]), [HUMAN, GENERATED, NEW]);
    expect(r.verdict).toBe("pass");
    expect(r.added).toEqual(["web/captured-today"]);
    // It still counts toward the denominator, or the population would be understated.
    expect(r.humanCompared).toBe(2);
  });

  /*
   * The two refusals below are the reason this file exists. Both describe a gate that examined
   * nothing and would otherwise print a pass, which is L-06 and which this repository has shipped
   * more than once.
   */
  it("REFUSES an empty run rather than passing it", () => {
    const r = findingBacktest(baselineOf([HUMAN]), []);
    expect(r.verdict).toBe("fail");
    expect(r.failures.join(" ")).toContain("examined nothing");
  });

  it("REFUSES a run with no human members, because half the gate could not have fired", () => {
    const r = findingBacktest(baselineOf([GENERATED]), [GENERATED]);
    expect(r.verdict).toBe("fail");
    expect(r.failures.join(" ")).toContain("zero human-labelled members");
  });

  it("counts the denominator from the current run, not from the members that moved", () => {
    const second = entry({ id: "another-hand-written", label: "human", firedRules: [] });
    const r = findingBacktest(baselineOf([HUMAN, second, GENERATED]), [HUMAN, second, GENERATED]);
    expect(r.humanCompared).toBe(2);
    expect(formatFindingBacktest(r)).toContain("2 human");
  });

  it("never emits an accuracy, precision or recall figure", () => {
    const r = findingBacktest(baselineOf([HUMAN, GENERATED]), [HUMAN, GENERATED]);
    const text = formatFindingBacktest(r);
    // Every member of these corpora is constructed or hand-labelled, so a rate derived from them
    // would describe the corpus rather than the world. Publishing one is the defect claims-officer
    // exists to refuse.
    expect(text).not.toMatch(/\b\d+(\.\d+)?\s*%/);
    expect(text.toLowerCase()).not.toContain("accuracy");
    expect(text.toLowerCase()).not.toContain("precision");
  });
});
