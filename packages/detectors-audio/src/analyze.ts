import { analyzeMedia } from "@slop/provenance";
import type { DetectorResult, EvidenceKind, Input } from "@slop/core";
import { AUDIO_PROBE_WEIGHTS } from "./artifact.js";
import type { AudioArtifact, AudioProbeId } from "./artifact.js";
import { AUDIO_CORPUS_VERSION, AUDIO_RULES } from "./rules.js";
import type { AudioRule } from "./rules.js";

export const AUDIO_DETECTOR_ID = "audio.provenance";

/** Any rule whose evidence is a measurement of the samples rather than a declaration. */
export const isStreamRuleId = (ruleId: string): boolean => ruleId.startsWith("stream.");

/**
 * Turn audio observations into findings.
 *
 * `evidenceKind` IS COMPUTED FROM WHAT ACTUALLY FIRED, and that is the point of this file.
 *
 * A result whose findings are all declarations is `"provenance"`: somebody wrote a field and
 * we read it back, and a reader can go and look at the same bytes. The moment ONE measurement
 * rule fires, the whole RESULT is downgraded to `"probabilistic"` — not just that finding —
 * because a report is read as a single claim and its weakest line sets what the claim is
 * worth. A receipt whose header says "provenance" and whose fourth line is a noise floor is
 * a receipt that overstates itself.
 *
 * It is never `"deterministic"`. Some of what the decoder reports is a re-readable container
 * fact and would qualify on its own, but nothing this detector DOES with those facts is: every
 * conclusion drawn from a measurement is an inference, and "deterministic" in this product
 * means a fact the user can re-read rather than a number we happen to be confident about.
 * `@slop/core`'s `validate.ts` hangs a real consequence on the distinction — a
 * non-deterministic result may not ship an auto-applicable patch — so claiming the stronger
 * kind would buy a capability we have not earned.
 *
 * The downgrade is ONE-WAY and a test proves it: no combination of findings turns a
 * probabilistic result back into a provenance one.
 */
export function analyzeAudioArtifact(
  artifact: AudioArtifact,
  input: Input,
  opts: {
    readonly rules?: readonly AudioRule[];
    readonly now?: () => Date;
    readonly bypassLaunderingGateForTesting?: boolean;
  } = {},
): DetectorResult {
  const result = analyzeMedia<AudioArtifact, AudioProbeId>(artifact, input, {
    detectorId: AUDIO_DETECTOR_ID,
    modality: "audio",
    evidenceKind: "provenance",
    rules: opts.rules ?? AUDIO_RULES,
    probeWeights: AUDIO_PROBE_WEIGHTS,
    corpusVersion: AUDIO_CORPUS_VERSION,
    ...(opts.now ? { now: opts.now } : {}),
    ...(opts.bypassLaunderingGateForTesting ? { bypassLaunderingGateForTesting: true } : {}),
  });

  const measured = result.findings.filter((f) => isStreamRuleId(f.ruleId));
  if (measured.length === 0) return result;

  const evidenceKind: EvidenceKind = "probabilistic";
  return {
    ...result,
    evidenceKind,
    warnings: [
      ...(result.warnings ?? []),
      `${measured.length} of the ${result.findings.length} line(s) here is a MEASUREMENT of the samples rather ` +
        `than a field read out of the container: ${measured.map((f) => f.ruleId).join(", ")}. The whole result is ` +
        `therefore reported as probabilistic rather than as provenance, that family is capped below every other ` +
        `positive family, and each of those lines carries the command we ran for its numbers, so the measurement ` +
        `can be repeated rather than taken on trust.`,
    ],
  };
}
