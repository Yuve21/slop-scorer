import { readFile } from "node:fs/promises";
import { asMediaArtifact } from "@slop/provenance";
import { MEDIA_CONFIG } from "@slop/provenance";
import type { AnalyzeContext, Detector, DetectorResult, Input, RuleDescriptor, ScoringConfig } from "@slop/core";
import { analyzeAudioArtifact, AUDIO_DETECTOR_ID } from "./analyze.js";
import { ingestAudio } from "./artifact.js";
import type { AudioArtifact } from "./artifact.js";
import { listenToAudio } from "./listen/ffprobe.js";
import { AUDIO_CORPUS_VERSION, AUDIO_RULE_DESCRIPTORS, AUDIO_RULES } from "./rules.js";

/** The audio scoring config. Shared families and caps; only the corpus version differs. */
export const AUDIO_CONFIG: ScoringConfig = { ...MEDIA_CONFIG, corpusVersion: AUDIO_CORPUS_VERSION };

/**
 * Whether this build is allowed to shell out to a local decoder, and how you say so.
 *
 * ONE explicit switch, read once, at the point of use. `SLOP_AUDIO_LISTEN=1` and nothing
 * else: not a truthy-ish parse, not a "1/true/yes/on" family, not an auto-detect that runs
 * ffmpeg because it happens to be on PATH. A capability that turns itself on when the
 * environment looks right is a capability nobody can prove is off, and "off by default" is
 * the claim this package makes in its README.
 *
 * The variable enables an attempt. It never guarantees a reading: a host with the switch set
 * and no decoder installed produces a `tool_unavailable` reading, which is a sentence in the
 * report rather than an error and rather than silence.
 */
export const LISTEN_ENV_VAR = "SLOP_AUDIO_LISTEN";

export const listeningRequested = (env: Record<string, string | undefined> = process.env): boolean =>
  env[LISTEN_ENV_VAR] === "1";

export const audioDetector: Detector = {
  id: AUDIO_DETECTOR_ID,
  modality: "audio",
  /**
   * The DECLARED kind, which is the strongest thing this detector can produce and therefore
   * the one a registry advertises. An individual result downgrades itself to
   * `"probabilistic"` when a measurement rule fires; see `analyze.ts`.
   */
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
    // The listen is attempted BEFORE the ingest and its result is handed in, because the
    // ingest is pure and synchronous and is staying that way. A `listenToAudio` that is
    // switched off returns immediately without touching the file system.
    const stream = await listenToAudio(input.path, { enabled: listeningRequested() });
    const artifact = ingestAudio(bytes, { locator: input.path, mediaType: input.mediaType, stream });
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
