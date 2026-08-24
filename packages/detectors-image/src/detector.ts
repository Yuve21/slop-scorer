import { readFile } from "node:fs/promises";
import { asMediaArtifact, decideFetch } from "@slop/provenance";
import type { AnalyzeContext, Detector, DetectorResult, Input, RuleDescriptor } from "@slop/core";
import { analyzeImageArtifact, IMAGE_DETECTOR_ID } from "./analyze.js";
import { ingestImage } from "./artifact.js";
import type { ImageArtifact } from "./artifact.js";
import { IMAGE_CORPUS_VERSION, IMAGE_RULE_DESCRIPTORS, IMAGE_RULES } from "./rules.js";

/**
 * The image `Detector`.
 *
 * `accepts` is short and the omission is the policy: `file` and `artifact`, no `media-url`.
 * This detector reads bytes somebody hands it. It does not go and get them. See
 * `@slop/provenance/fetch-policy.ts` for the argument, which is the same one that keeps a
 * scraper out of the reproduction pipeline.
 */
export const imageDetector: Detector = {
  id: IMAGE_DETECTOR_ID,
  modality: "image",
  evidenceKind: "provenance",
  corpusVersion: IMAGE_CORPUS_VERSION,
  accepts: ["file", "artifact"],
  replayable: true,
  rules: IMAGE_RULE_DESCRIPTORS as readonly RuleDescriptor[],

  canHandle(input: Input): boolean {
    if (input.kind === "file") return /^image\//.test(input.mediaType);
    return input.kind === "artifact" && input.detectorId === IMAGE_DETECTOR_ID;
  },

  async analyze(input: Input, ctx?: AnalyzeContext): Promise<DetectorResult> {
    const now = ctx?.now;
    if (input.kind === "artifact") {
      return analyzeImageArtifact(asImageArtifact(input.artifact), input, {
        rules: IMAGE_RULES,
        ...(now ? { now } : {}),
      });
    }
    if (input.kind === "media-url") {
      // Never reached through `canHandle`, and handled anyway so a caller that routes around
      // the router gets the typed refusal rather than a fetch.
      const decision = decideFetch(input.url);
      throw new Error(
        decision.allowed
          ? `${IMAGE_DETECTOR_ID} does not retrieve URLs. Hand it the file.`
          : `${IMAGE_DETECTOR_ID}: ${decision.detail}`,
      );
    }
    if (input.kind !== "file") {
      throw new Error(`${IMAGE_DETECTOR_ID} cannot handle input of kind "${input.kind}".`);
    }
    const bytes = new Uint8Array(await readFile(input.path));
    const artifact = ingestImage(bytes, { locator: input.path, mediaType: input.mediaType });
    return analyzeImageArtifact(artifact, input, { rules: IMAGE_RULES, ...(now ? { now } : {}) });
  },
};

export function asImageArtifact(value: unknown): ImageArtifact {
  const artifact = asMediaArtifact(value, IMAGE_DETECTOR_ID);
  if (artifact.modality !== "image") {
    throw new Error(`${IMAGE_DETECTOR_ID}: stored artifact is a ${artifact.modality} artifact.`);
  }
  return artifact as ImageArtifact;
}
