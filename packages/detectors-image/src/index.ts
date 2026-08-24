/**
 * @slop/detectors-image
 *
 * "What does this image file declare about itself?" — and, before that, "are these even the
 * original bytes?".
 *
 * WHAT THIS PACKAGE WILL NEVER DO, stated first because the absence is the product.
 *
 * It does not look at pixels. There is no classifier, no frequency transform, no noise
 * residual, no upsampling detector, and no model asked to narrate why an image "looks"
 * generated. `image-detection-reality.md` rules all of it out on measurement rather than
 * taste: off-the-shelf detectors sit at coin-flip on in-the-wild content; a mild
 * resize-plus-JPEG takes a leading method's separation apart; a shipping commercial tool
 * called six of twenty award-winning photojournalism images machine-made; and the documented
 * cost of getting this wrong is a person banned from a community over a hundred-hour
 * illustration after offering their process files as proof.
 *
 * So `evidenceKind` here is `"provenance"`. It is never `"deterministic"` — that word belongs
 * to the code and web corpora, where a rule cites a line you can open — and it is never a
 * probabilistic pixel read, because this package does not make one.
 *
 * The two consequences a caller should plan for:
 *
 *  1. A re-encoded or screenshotted image returns `inconclusive` with the code
 *     `artifact_re_encoded` and NO score. Most images arriving from the internet are in that
 *     state.
 *  2. An image with no declarations returns `inconclusive` with the code
 *     `no_declared_provenance`. Most images that clear the gate are in THAT state.
 *
 * Between them, this detector abstains far more often than it speaks. The abstention rate is
 * computed by the calibration suite and printed on every run; it is the headline number for
 * this package, not an embarrassment to be tuned away.
 */

export type { ImageArtifact, ImageProbeId } from "./artifact.js";
export {
  IMAGE_PROBE_WEIGHTS,
  ingestImage,
  imageVariant,
  neutralImage,
} from "./artifact.js";

export type { ImageRule } from "./rules.js";
export { IMAGE_CORPUS_VERSION, IMAGE_PROBE_IDS, IMAGE_RULE_DESCRIPTORS, IMAGE_RULES, imageRuleById } from "./rules.js";

export { analyzeImageArtifact, IMAGE_DETECTOR_ID } from "./analyze.js";
export { asImageArtifact, imageDetector } from "./detector.js";
export { IMAGE_CONFIG } from "./config.js";

export {
  IMAGE_AMBIGUOUS,
  IMAGE_CORPUS,
  IMAGE_LAUNDERED,
  IMAGE_NEGATIVES,
  IMAGE_POSITIVES,
} from "./fixtures/corpus.js";
