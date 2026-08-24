import { analyzeMedia } from "@slop/provenance";
import type { DetectorResult, EvidenceKind, Input } from "@slop/core";
import { VIDEO_PROBE_WEIGHTS } from "./artifact.js";
import type { VideoArtifact, VideoProbeId } from "./artifact.js";
import { VIDEO_CORPUS_VERSION, VIDEO_RULES } from "./rules.js";
import type { VideoRule } from "./rules.js";

export const VIDEO_DETECTOR_ID = "video.provenance";

/**
 * Turn video observations into findings.
 *
 * The one thing this wrapper does beyond calling the shared loop: it DOWNGRADES the declared
 * evidence kind when a probabilistic line made it into the result.
 *
 * A report is only as epistemically strong as its weakest cited line. If the desync rule
 * fired, this result contains a statistic somebody else computed, and calling the whole thing
 * "provenance" would let a consumer render a signed-manifest badge over a number that came out
 * of an alignment measurer. The downgrade is one-way and is computed from the findings
 * themselves rather than declared, so a new probabilistic rule cannot be added without the
 * label following it automatically.
 */
export function analyzeVideoArtifact(
  artifact: VideoArtifact,
  input: Input,
  opts: {
    readonly rules?: readonly VideoRule[];
    readonly now?: () => Date;
    readonly bypassLaunderingGateForTesting?: boolean;
  } = {},
): DetectorResult {
  const result = analyzeMedia<VideoArtifact, VideoProbeId>(artifact, input, {
    detectorId: VIDEO_DETECTOR_ID,
    modality: "video",
    evidenceKind: "provenance",
    rules: opts.rules ?? VIDEO_RULES,
    probeWeights: VIDEO_PROBE_WEIGHTS,
    corpusVersion: VIDEO_CORPUS_VERSION,
    ...(opts.now ? { now: opts.now } : {}),
    ...(opts.bypassLaunderingGateForTesting ? { bypassLaunderingGateForTesting: true } : {}),
  });
  const hasProbabilistic = result.findings.some((f) => f.family === "stream-consistency");
  const evidenceKind: EvidenceKind = hasProbabilistic ? "probabilistic" : "provenance";
  return { ...result, evidenceKind };
}
