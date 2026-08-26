/**
 * @slop/provenance
 *
 * The shared backbone for the three media modalities. It answers one question — "what did
 * this file declare about itself, and are these even the original bytes?" — from container
 * structure alone. No pixels are read, no samples are decoded, no model is called, and there
 * is no network in this package.
 *
 * The two things to read first are `reencode.ts`, which is the gate that forces abstention on
 * a laundered artifact, and `c2pa.ts`, whose `absenceIsNotEvidence` encodes the rule that an
 * absent manifest is no evidence in either direction.
 */

export type {
  ContainerFormat,
  ContainerRecord,
  EncoderRecord,
  JpegRecord,
  MediaShape,
  MetadataPayload,
  PayloadKind,
  SegmentRecord,
} from "./container/index.js";
export {
  at,
  clip,
  crc32,
  emptyContainer,
  estimateQuality,
  IJG_LUMA_REFERENCE_SUM,
  IJG_LUMA_TABLE,
  indexOfAscii,
  inflateBounded,
  inspectContainer,
  latin1,
  MAX_METADATA_INFLATE_BYTES,
  parseIsoBmff,
  parseJpeg,
  parseMpegAudio,
  parsePng,
  parseRiff,
  PNG_SIGNATURE,
  readExifStrings,
  Reader,
  sameWriter,
  utf8,
} from "./container/index.js";

export type { C2paAction, C2paManifest, C2paRecord, C2paState, DigitalSourceKind, DigitalSourceType } from "./c2pa.js";
export {
  ABSENCE_IS_NOT_EVIDENCE,
  absenceIsNotEvidence,
  BROKEN_MANIFEST_IS_NOT_EVIDENCE,
  CAPTURE_SOURCE_TYPES,
  declaredCapture,
  declaredTrainedAlgorithmic,
  DIGITAL_SOURCE_KINDS,
  DIGITAL_SOURCE_TYPES,
  digitalSourceTypeOf,
  kindOfDigitalSourceType,
  locatedManifest,
  mayContributeGenerationEvidence,
  NO_MANIFEST,
  rejectedManifest,
  verifiedManifest,
} from "./c2pa.js";

export type { IptcConcept } from "./iptc-vocabulary.js";
export {
  IPTC_DIGITAL_SOURCE_TYPE_CONCEPTS,
  IPTC_SCHEME_MODIFIED,
  IPTC_SCHEME_URI,
  IPTC_SNAPSHOT_RETRIEVED,
} from "./iptc-vocabulary.js";

export type { MetadataField, MetadataRecord } from "./metadata.js";
export { EMPTY_METADATA, readMetadata } from "./metadata.js";

export type { GeneratorClass, GeneratorHit, GeneratorSignature } from "./generators.js";
export { GENERATOR_SIGNATURES, generatorById, matchGenerators } from "./generators.js";

export type { WatermarkOutcome, WatermarkProbe, WatermarkScheme } from "./watermark.js";
export {
  AUDIO_WATERMARK_PROBES,
  citableWatermarks,
  DEFAULT_WATERMARK_PROBES,
  notChecked,
  WATERMARK_ABSENCE_NOTE,
} from "./watermark.js";

export type { LaunderingCode, LaunderingIndicator, LaunderingRecord, PristineCode, PristineMarker } from "./reencode.js";
export { assessLaundering, LAUNDERING_THRESHOLD, launderingDetail } from "./reencode.js";

export type { MediaArtifact, MediaModality, MediaProbeId, MediaSourceRecord, IngestOptions } from "./artifact.js";
export {
  asMediaArtifact,
  ingestMedia,
  MEDIA_ARTIFACT_SCHEMA_VERSION,
  MEDIA_PROBE_WEIGHTS,
  mediaProbes,
  neutralMedia,
} from "./artifact.js";

export { MEDIA_CONFIG, MEDIA_FAMILIES } from "./families.js";

export type { FixtureChange, FixtureKit, MediaRule } from "./rules.js";
export { MEDIA_CORPUS_VERSION, provenanceRules } from "./rules.js";

export type { AnalyzeMediaOptions } from "./analyze.js";
export { analyzeMedia, coverageOfMedia } from "./analyze.js";

export type { MediaClaimViolation } from "./claims.js";
export {
  assertMediaSafe,
  ForbiddenMediaClaimError,
  FORBIDDEN_MEDIA_PHRASES,
  mediaClaimViolations,
  phraseHit,
  sentencesOf,
} from "./claims.js";

export type { FetchDecision } from "./fetch-policy.js";
export { decideFetch, PLATFORM_HOST_PATTERNS, platformRefusal } from "./fetch-policy.js";

export type { JpegOptions, Mp3Options, Mp4Options, PngOptions, WavOptions } from "./fixtures/synth.js";
export { ijgTableAt, synthJpeg, synthMp3, synthMp4, synthPng, synthWav } from "./fixtures/synth.js";
