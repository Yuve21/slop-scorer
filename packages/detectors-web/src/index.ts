/**
 * @slop/detectors-web
 *
 * "Is this rendered page template-shaped?", answered with citable, deterministic evidence.
 * Every rule in this corpus cites something a user can re-read in DevTools: a computed style,
 * a selector, a header, a response body. Nothing here is a model output.
 */

export type {
  CardSignature,
  ChunkRecord,
  FontFaceRecord,
  ImageTextRecord,
  KeyframeRecord,
  MotionLibraryMarker,
  MotionRecord,
  ProbeId,
  TypeSample,
  WebArtifact,
  WellKnownRecord,
} from "./artifact.js";
export { ARTIFACT_SCHEMA_VERSION, allProbesRan, neutralArtifact, PROBE_WEIGHTS } from "./artifact.js";

export type { DeepPartial, RuleContext, RuleFixtureCase, WebRule } from "./rule.js";
export { ev, patch } from "./rule.js";

export { analyzeArtifact, coverageOf, WEB_DETECTOR_ID } from "./analyze.js";

export type { ProbeOptions } from "./probe.js";
export { PlaywrightUnavailableError, probeUrl, WELL_KNOWN_PATHS } from "./probe.js";

export { asWebArtifact, webDetector } from "./detector.js";

export {
  BUILDER_RULES,
  COPY_RULES,
  CORPUS_VERSION,
  COUNTER_RULES,
  CRAFT_RULES,
  IMAGE_TEXT_RULES,
  MOTION_RULES,
  RULE_DESCRIPTORS,
  ruleById,
  STRUCTURE_RULES,
  VISUAL_RULES,
  WEB_RULES,
} from "./rules/index.js";

export { NEGATIVE_CORPUS } from "./fixtures/negatives.js";
