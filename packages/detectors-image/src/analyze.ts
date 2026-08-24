import { analyzeMedia } from "@slop/provenance";
import type { DetectorResult, Input } from "@slop/core";
import { IMAGE_PROBE_WEIGHTS } from "./artifact.js";
import type { ImageArtifact, ImageProbeId } from "./artifact.js";
import { IMAGE_CORPUS_VERSION, IMAGE_RULES } from "./rules.js";
import type { ImageRule } from "./rules.js";

export const IMAGE_DETECTOR_ID = "image.provenance";

/**
 * Turn image observations into findings, through the shared loop so the re-encoding gate
 * cannot be bypassed by a modality forgetting to call it.
 *
 * `evidenceKind` is `"provenance"`, always. This detector has no probabilistic rule to
 * declare and it must never claim `"deterministic"`: that word is reserved for a citation a
 * reader re-reads in a browser or an editor, and a metadata field is a declaration somebody
 * made rather than a fact about the content.
 */
export function analyzeImageArtifact(
  artifact: ImageArtifact,
  input: Input,
  opts: { readonly rules?: readonly ImageRule[]; readonly now?: () => Date; readonly bypassLaunderingGateForTesting?: boolean } = {},
): DetectorResult {
  return analyzeMedia<ImageArtifact, ImageProbeId>(artifact, input, {
    detectorId: IMAGE_DETECTOR_ID,
    modality: "image",
    evidenceKind: "provenance",
    rules: opts.rules ?? IMAGE_RULES,
    probeWeights: IMAGE_PROBE_WEIGHTS,
    corpusVersion: IMAGE_CORPUS_VERSION,
    ...(opts.now ? { now: opts.now } : {}),
    ...(opts.bypassLaunderingGateForTesting ? { bypassLaunderingGateForTesting: true } : {}),
  });
}
