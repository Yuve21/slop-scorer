import { MalformedResultError, VacuousProbeError } from "./errors.js";
import type { DetectorResult } from "./types.js";

/**
 * The contract check every detector's output passes before it can reach the engine.
 *
 * The important one is the last block. A probe that ran and collected nothing, when it was
 * declared to collect something, means every rule downstream of it failed to fire for a
 * reason that has nothing to do with the artifact. Left alone that shows up as a LOW score
 * with a straight face. It throws instead.
 */
export function assertWellFormedResult(result: DetectorResult): DetectorResult {
  const id = result.detectorId;

  if (!result.detectorId) throw new MalformedResultError("(anonymous)", "detectorId is empty.");
  if (!result.corpusVersion) throw new MalformedResultError(id, "corpusVersion is empty.");

  const seen = new Set<string>();
  for (const f of result.findings) {
    if (f.evidence.length === 0) {
      throw new MalformedResultError(id, `finding "${f.ruleId}" has no evidence. No evidence, no finding.`);
    }
    for (const e of f.evidence) {
      if (!e.locator || !e.observed) {
        throw new MalformedResultError(
          id,
          `finding "${f.ruleId}" has evidence with an empty locator or observed value; a citation nobody can follow is not a citation.`,
        );
      }
    }
    if (seen.has(f.ruleId)) {
      throw new MalformedResultError(
        id,
        `rule "${f.ruleId}" produced two findings. A rule fires once; repeats belong in its evidence array so multiplicity decay applies.`,
      );
    }
    seen.add(f.ruleId);
    if (f.polarity === "signal" && f.weight < 0) {
      throw new MalformedResultError(id, `signal "${f.ruleId}" has a negative weight; declare it as a counter instead.`);
    }
    if (f.polarity === "counter" && f.weight > 0) {
      throw new MalformedResultError(id, `counter "${f.ruleId}" has a positive weight; counter-evidence must lower the score.`);
    }
    if (!result.rulesEvaluated.includes(f.ruleId)) {
      throw new MalformedResultError(
        id,
        `rule "${f.ruleId}" fired but is not in rulesEvaluated; the "we looked at these" list must be complete or it is not auditable.`,
      );
    }
  }

  if (result.coverage.ratio < 0 || result.coverage.ratio > 1) {
    throw new MalformedResultError(id, `coverage.ratio ${result.coverage.ratio} is outside 0..1.`);
  }
  if (result.coverage.probes.length === 0) {
    throw new MalformedResultError(
      id,
      "coverage.probes is empty. A detector that does not say what it looked at cannot be believed about what it found.",
    );
  }

  for (const p of result.coverage.probes) {
    if (p.ran && p.expectsNonEmpty && (p.denominator ?? 0) === 0) {
      throw new VacuousProbeError(id, p.id, p.note);
    }
  }

  return result;
}
