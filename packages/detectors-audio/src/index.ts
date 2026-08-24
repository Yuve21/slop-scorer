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
export {
  AUDIO_DEFAULT_WATERMARKS,
  AUDIO_PROBE_WEIGHTS,
  audioVariant,
  ingestAudio,
  neutralAudio,
} from "./artifact.js";

// ---- the listening layer ----------------------------------------------------------------
export type {
  BandEnergy,
  Dispersion,
  LevelReading,
  SilentSpan,
  SpectralStep,
  StreamFacts,
  StreamReading,
  StreamReadingState,
} from "./listen/reading.js";
export {
  DIGITAL_ZERO_FLOOR_DB,
  dispersion,
  durationDisagreement,
  gapLengths,
  NOT_ATTEMPTED,
  spanLength,
  steepestStep,
  STREAM_THRESHOLDS,
  unread,
  usableBandCeilingHz,
  usableBands,
} from "./listen/reading.js";
export type { ListenOptions } from "./listen/ffprobe.js";
export { decibels, listenToAudio, LOSSY_BANDS_NOTE, parseFacts, parseLevels, parseSilences } from "./listen/ffprobe.js";

export {
  CLEAN_FLOOR_READING,
  DURATION_MISMATCH_READING,
  FULL_BAND_READING,
  ROOM_TONE_READING,
  STREAM_CORPUS_VERSION,
  STREAM_FAMILY_CAVEAT,
  streamProbeRow,
  streamRules,
  timecode,
  UNIFORM_GAPS_READING,
  UPSAMPLED_READING,
  VARIED_GAPS_READING,
  withReading,
} from "./stream.js";

export type { Transcript, TranscriptSource, TranscriptState } from "./transcribe.js";
export {
  assertMayEnterCorpus,
  mayEnterCorpus,
  NO_TRANSCRIPT,
  rulesForTranscript,
  TRANSCRIPT_CAVEAT,
  TRANSCRIPT_EXCLUDED_RULES,
  VENDOR_TRANSCRIPT_REFUSAL,
} from "./transcribe.js";

export type { AudioRule } from "./rules.js";
export {
  AUDIO_CORPUS_VERSION,
  AUDIO_PROBE_IDS,
  AUDIO_PROVENANCE_RULES,
  AUDIO_RULE_DESCRIPTORS,
  AUDIO_RULES,
  AUDIO_STREAM_RULES,
  audioRuleById,
  STREAM_PROBE,
} from "./rules.js";

export { analyzeAudioArtifact, AUDIO_DETECTOR_ID, isStreamRuleId } from "./analyze.js";
export { asAudioArtifact, AUDIO_CONFIG, audioDetector, LISTEN_ENV_VAR, listeningRequested } from "./detector.js";
export { AUDIO_MEASUREMENT_CAVEAT, AUDIO_OUT_OF_SCOPE, AUDIO_SCOPE_STATEMENT } from "./scope.js";

export {
  AUDIO_AMBIGUOUS,
  AUDIO_CORPUS,
  AUDIO_CORPUS_REFUSAL,
  AUDIO_LAUNDERED,
  AUDIO_MEASURED,
  AUDIO_NEGATIVES,
  AUDIO_POSITIVES,
} from "./fixtures/corpus.js";
