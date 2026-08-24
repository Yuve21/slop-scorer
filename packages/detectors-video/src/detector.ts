import { readFile } from "node:fs/promises";
import { asMediaArtifact, decideFetch, platformRefusal } from "@slop/provenance";
import { notAssessed } from "@slop/core";
import type { AnalyzeContext, Detector, DetectorResult, Input, Report, RuleDescriptor } from "@slop/core";
import { analyzeVideoArtifact, VIDEO_DETECTOR_ID } from "./analyze.js";
import { ingestVideo } from "./artifact.js";
import type { VideoArtifact } from "./artifact.js";
import { VIDEO_CONFIG } from "./config.js";
import { VIDEO_CORPUS_VERSION, VIDEO_RULE_DESCRIPTORS, VIDEO_RULES } from "./rules.js";

/**
 * The video `Detector`.
 *
 * It accepts a file and a stored artifact. It does not accept a platform URL, and the refusal
 * is a typed outcome rather than a thrown error: see `reportForPlatformUrl` and the README.
 */
export const videoDetector: Detector = {
  id: VIDEO_DETECTOR_ID,
  modality: "video",
  evidenceKind: "provenance",
  corpusVersion: VIDEO_CORPUS_VERSION,
  accepts: ["file", "artifact"],
  replayable: true,
  rules: VIDEO_RULE_DESCRIPTORS as readonly RuleDescriptor[],

  canHandle(input: Input): boolean {
    if (input.kind === "file") return /^video\//.test(input.mediaType);
    return input.kind === "artifact" && input.detectorId === VIDEO_DETECTOR_ID;
  },

  async analyze(input: Input, ctx?: AnalyzeContext): Promise<DetectorResult> {
    const now = ctx?.now;
    if (input.kind === "artifact") {
      return analyzeVideoArtifact(asVideoArtifact(input.artifact), input, {
        rules: VIDEO_RULES,
        ...(now ? { now } : {}),
      });
    }
    if (input.kind !== "file") {
      throw new Error(`${VIDEO_DETECTOR_ID} cannot handle input of kind "${input.kind}".`);
    }
    const bytes = new Uint8Array(await readFile(input.path));
    const artifact = ingestVideo(bytes, { locator: input.path, mediaType: input.mediaType });
    return analyzeVideoArtifact(artifact, input, { rules: VIDEO_RULES, ...(now ? { now } : {}) });
  },
};

/**
 * A URL the caller wanted us to look at, answered honestly.
 *
 * Returns a full `Report` with `status: "not_assessed"` and the code `cannot_fetch`, so a
 * consumer branches on the same field it branches on for every other outcome. It never
 * returns a score, never returns a zero, and never returns an empty state a UI could render
 * as a clean bill of health.
 *
 * A URL on a host we have no particular reason to refuse still comes back `not_assessed`:
 * this build has no fetcher at all, and pretending otherwise would be worse than saying so.
 */
export function reportForPlatformUrl(url: string): Report {
  const decision = decideFetch(url);
  if (!decision.allowed) return notAssessed("cannot_fetch", decision.detail, { config: VIDEO_CONFIG });
  return notAssessed(
    "cannot_fetch",
    "We did not retrieve this. This build reads bytes it is handed and has no retrieval path at all, deliberately: " +
      "a detector that fetches is a detector that has to decide whose access controls to respect. Save the file and " +
      "hand it over directly, ideally as it left the tool that wrote it.",
    { config: VIDEO_CONFIG },
  );
}

export { platformRefusal };

export function asVideoArtifact(value: unknown): VideoArtifact {
  const artifact = asMediaArtifact(value, VIDEO_DETECTOR_ID);
  if (artifact.modality !== "video") {
    throw new Error(`${VIDEO_DETECTOR_ID}: stored artifact is a ${artifact.modality} artifact.`);
  }
  if (!("streams" in artifact)) {
    throw new Error(`${VIDEO_DETECTOR_ID}: stored artifact has no stream record, so its track probe cannot be read.`);
  }
  return artifact as VideoArtifact;
}
