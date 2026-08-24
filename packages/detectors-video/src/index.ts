/**
 * @slop/detectors-video
 *
 * The image detector's backbone, plus container and encoder fingerprints for ISO base media
 * files and exactly one probabilistic signal.
 *
 * TWO DECISIONS WORTH READING BEFORE THE CODE.
 *
 * 1. NO SCRAPER. Handed a TikTok, Reels, Shorts or any other platform URL, this package
 *    returns a typed `cannot_fetch` outcome naming the constraint. It does not download. The
 *    full argument is in `@slop/provenance/fetch-policy.ts` and in the README; the short
 *    version is that a platform download hands back the PLATFORM'S transcode, which the
 *    re-encoding gate already refuses to score, so circumventing an access control would buy
 *    an artifact we had already committed to abstaining on.
 *
 * 2. THE ONE PROBABILISTIC RULE IS FENCED. Audio and video drifting apart is a statistic, it
 *    arrives from an external measurer rather than being computed here, its family cap is the
 *    smallest in the config, its title begins "Probabilistic signal:" so a reader sees it in
 *    the receipt, and a result containing it is downgraded from `provenance` to
 *    `probabilistic` automatically.
 */

export type { StreamRecord, VideoArtifact, VideoProbeId } from "./artifact.js";
export {
  ingestVideo,
  neutralVideo,
  UNMEASURED_STREAMS,
  VIDEO_PROBE_WEIGHTS,
  videoVariant,
  withStreamMeasurement,
} from "./artifact.js";

export type { VideoRule } from "./rules.js";
export {
  PROBABILISTIC_NOTE_PREFIX,
  PROBABILISTIC_TITLE_PREFIX,
  VIDEO_CORPUS_VERSION,
  VIDEO_PROBE_IDS,
  VIDEO_RULE_DESCRIPTORS,
  VIDEO_RULES,
  videoRuleById,
} from "./rules.js";

export { analyzeVideoArtifact, VIDEO_DETECTOR_ID } from "./analyze.js";
export { asVideoArtifact, platformRefusal, reportForPlatformUrl, videoDetector } from "./detector.js";
export { VIDEO_CONFIG } from "./config.js";

export {
  VIDEO_AMBIGUOUS,
  VIDEO_CORPUS,
  VIDEO_LAUNDERED,
  VIDEO_NEGATIVES,
  VIDEO_POSITIVES,
  VIDEO_SILENT,
} from "./fixtures/corpus.js";
