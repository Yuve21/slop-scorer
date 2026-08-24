import { MalformedResultError, VacuousProbeError } from "./errors.js";
import { assertWellFormedRemediation, isApplicable } from "./remediation.js";
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
    for (const r of f.remediation ?? []) {
      // A patch is a stronger claim than the finding it hangs off. Where the detector's own
      // evidence is a model output or a signed manifest rather than a fact at a locator, the
      // only honest proposal is one a person decides on. Checked here, against the result's
      // declared evidenceKind, so a modality added later inherits the constraint without
      // having to remember it.
      // The FINDING's kind when it declares one, the result's otherwise. A deterministic
      // corpus that grew one probabilistic rule (text recovered out of a picture) must not
      // be able to ship that rule's guess as an applicable patch on the strength of its
      // neighbours: the weaker claim is held to the weaker standard, per line.
      const kind = f.evidenceKind ?? result.evidenceKind;
      if (kind !== "deterministic" && isApplicable(r)) {
        throw new MalformedResultError(
          id,
          `finding "${f.ruleId}" carries an applicable ${r.kind} remediation on a ${kind} read. A detector that abstains from certainty cannot ship a patch that asserts it; use a manual remediation.`,
        );
      }
      if (f.polarity === "counter") {
        throw new MalformedResultError(
          id,
          `counter "${f.ruleId}" carries a remediation. Counter-evidence argues FOR the artifact and there is nothing in it to fix.`,
        );
      }
      try {
        assertWellFormedRemediation(f.ruleId, r);
      } catch (error) {
        throw new MalformedResultError(id, (error as Error).message);
      }
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
