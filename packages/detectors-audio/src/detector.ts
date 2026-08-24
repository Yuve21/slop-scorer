import { readFile } from "node:fs/promises";
import { asMediaArtifact } from "@slop/provenance";
import { MEDIA_CONFIG } from "@slop/provenance";
import type { AnalyzeContext, Detector, DetectorResult, Input, RuleDescriptor, ScoringConfig } from "@slop/core";
import { analyzeAudioArtifact, AUDIO_DETECTOR_ID } from "./analyze.js";
import { ingestAudio } from "./artifact.js";
import type { AudioArtifact } from "./artifact.js";
import { AUDIO_CORPUS_VERSION, AUDIO_RULE_DESCRIPTORS, AUDIO_RULES } from "./rules.js";

/** The audio scoring config. Shared families and caps; only the corpus version differs. */
export const AUDIO_CONFIG: ScoringConfig = { ...MEDIA_CONFIG, corpusVersion: AUDIO_CORPUS_VERSION };

export const audioDetector: Detector = {
  id: AUDIO_DETECTOR_ID,
  modality: "audio",
  evidenceKind: "provenance",
  corpusVersion: AUDIO_CORPUS_VERSION,
  accepts: ["file", "artifact"],
  replayable: true,
  rules: AUDIO_RULE_DESCRIPTORS as readonly RuleDescriptor[],

  canHandle(input: Input): boolean {
    if (input.kind === "file") return /^audio\//.test(input.mediaType);
    return input.kind === "artifact" && input.detectorId === AUDIO_DETECTOR_ID;
  },

  async analyze(input: Input, ctx?: AnalyzeContext): Promise<DetectorResult> {
    const now = ctx?.now;
    if (input.kind === "artifact") {
      return analyzeAudioArtifact(asAudioArtifact(input.artifact), input, {
        rules: AUDIO_RULES,
        ...(now ? { now } : {}),
      });
    }
    if (input.kind !== "file") {
      throw new Error(`${AUDIO_DETECTOR_ID} cannot handle input of kind "${input.kind}".`);
    }
    const bytes = new Uint8Array(await readFile(input.path));
    const artifact = ingestAudio(bytes, { locator: input.path, mediaType: input.mediaType });
    return analyzeAudioArtifact(artifact, input, { rules: AUDIO_RULES, ...(now ? { now } : {}) });
  },
};

export function asAudioArtifact(value: unknown): AudioArtifact {
  const artifact = asMediaArtifact(value, AUDIO_DETECTOR_ID);
  if (artifact.modality !== "audio") {
    throw new Error(`${AUDIO_DETECTOR_ID}: stored artifact is a ${artifact.modality} artifact.`);
  }
  return artifact as AudioArtifact;
}
