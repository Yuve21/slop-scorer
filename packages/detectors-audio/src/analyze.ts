import { analyzeMedia } from "@slop/provenance";
import type { DetectorResult, Input } from "@slop/core";
import { AUDIO_PROBE_WEIGHTS } from "./artifact.js";
import type { AudioArtifact, AudioProbeId } from "./artifact.js";
import { AUDIO_CORPUS_VERSION, AUDIO_RULES } from "./rules.js";
import type { AudioRule } from "./rules.js";

export const AUDIO_DETECTOR_ID = "audio.provenance";

/**
 * Turn audio observations into findings.
 *
 * `evidenceKind` is `"provenance"` and there is no path by which it becomes anything else:
 * this modality has no probabilistic rule and, per `scope.ts`, is not going to get one.
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
  return analyzeMedia<AudioArtifact, AudioProbeId>(artifact, input, {
    detectorId: AUDIO_DETECTOR_ID,
    modality: "audio",
    evidenceKind: "provenance",
    rules: opts.rules ?? AUDIO_RULES,
    probeWeights: AUDIO_PROBE_WEIGHTS,
    corpusVersion: AUDIO_CORPUS_VERSION,
    ...(opts.now ? { now: opts.now } : {}),
    ...(opts.bypassLaunderingGateForTesting ? { bypassLaunderingGateForTesting: true } : {}),
  });
}
