/**
 * @slop/detectors-audio
 *
 * Provenance and declared-writer markers for audio files. It reads the container, the tags,
 * an XMP packet and a Content Credential slot. It never analyses the sound.
 *
 * THE ONE THING TO UNDERSTAND ABOUT THIS MODALITY is in `scope.ts`, and it is a contractual
 * fact rather than an engineering one: voice cloning is closed to us on the reproduction
 * side, because the vendors' terms forbid it even with the subject's consent. So the honest
 * offering here is provenance plus a measured cost of producing a synthetic read of the same
 * words, and it is never a claim that a recording is a copy of a named person. That sentence
 * is unsayable by construction: the claim guard in `@slop/provenance` bans its vocabulary and
 * a test in this package proves the ban holds over every string this modality can emit.
 */

export type { AudioArtifact, AudioProbeId } from "./artifact.js";
export { audioVariant, AUDIO_PROBE_WEIGHTS, ingestAudio, neutralAudio } from "./artifact.js";

export type { AudioRule } from "./rules.js";
export {
  AUDIO_CORPUS_VERSION,
  AUDIO_PROBE_IDS,
  AUDIO_RULE_DESCRIPTORS,
  AUDIO_RULES,
  audioRuleById,
} from "./rules.js";

export { analyzeAudioArtifact, AUDIO_DETECTOR_ID } from "./analyze.js";
export { asAudioArtifact, AUDIO_CONFIG, audioDetector } from "./detector.js";
export { AUDIO_OUT_OF_SCOPE, AUDIO_SCOPE_STATEMENT } from "./scope.js";

export {
  AUDIO_AMBIGUOUS,
  AUDIO_CORPUS,
  AUDIO_LAUNDERED,
  AUDIO_NEGATIVES,
  AUDIO_POSITIVES,
} from "./fixtures/corpus.js";
