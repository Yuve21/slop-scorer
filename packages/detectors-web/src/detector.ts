import type { AnalyzeContext, Detector, DetectorResult, Input, RuleDescriptor } from "@slop/core";
import { analyzeArtifact, WEB_DETECTOR_ID } from "./analyze.js";
import { ARTIFACT_SCHEMA_VERSION } from "./artifact.js";
import type { WebArtifact } from "./artifact.js";
import { probeUrl } from "./probe.js";
import type { ProbeOptions } from "./probe.js";
import { CORPUS_VERSION, RULE_DESCRIPTORS, WEB_RULES } from "./rules/index.js";

/**
 * The web `Detector`.
 *
 * `replayable` is true and it carries weight: the detector accepts a previously stored
 * `WebArtifact` and re-scores it without touching the network. That is what makes the
 * calibration corpus reproducible, an appeal answerable against the exact bytes we read, and
 * a corpus bump measurable as a delta rather than a vibe.
 */
export const webDetector: Detector = {
  id: WEB_DETECTOR_ID,
  modality: "web",
  evidenceKind: "deterministic",
  corpusVersion: CORPUS_VERSION,
  accepts: ["url", "artifact"],
  replayable: true,
  rules: RULE_DESCRIPTORS as readonly RuleDescriptor[],

  canHandle(input: Input): boolean {
    if (input.kind === "url") return /^https?:\/\//i.test(input.url);
    return input.kind === "artifact" && input.detectorId === WEB_DETECTOR_ID;
  },

  async analyze(input: Input, ctx?: AnalyzeContext): Promise<DetectorResult> {
    const now = ctx?.now;
    if (input.kind === "artifact") {
      return analyzeArtifact(asWebArtifact(input.artifact), input, { rules: WEB_RULES, ...(now ? { now } : {}) });
    }
    if (input.kind !== "url") {
      throw new Error(`${WEB_DETECTOR_ID} cannot handle input of kind "${input.kind}".`);
    }
    const opts = (ctx?.options ?? {}) as ProbeOptions;
    const artifact = await probeUrl(input.url, {
      ...opts,
      ...(ctx?.signal ? { signal: ctx.signal } : {}),
    });
    return analyzeArtifact(artifact, input, { rules: WEB_RULES, ...(now ? { now } : {}) });
  },
};

/**
 * Replay guard.
 *
 * A stored artifact from an older schema is not "mostly fine": its missing fields read as
 * absent tells, so an old capture would score LOWER against a newer corpus for reasons that
 * have nothing to do with the page. Version mismatches fail here instead.
 */
export function asWebArtifact(value: unknown): WebArtifact {
  if (!value || typeof value !== "object") {
    throw new Error(`${WEB_DETECTOR_ID}: replay input is not an object.`);
  }
  const v = value as { schemaVersion?: unknown; probes?: unknown };
  if (v.schemaVersion !== ARTIFACT_SCHEMA_VERSION) {
    throw new Error(
      `${WEB_DETECTOR_ID}: stored artifact is schema v${String(v.schemaVersion)}, this build reads v${ARTIFACT_SCHEMA_VERSION}. ` +
        `Re-capture rather than replay: missing fields in an old capture read as absent tells, which lowers the score for a reason that is not about the page.`,
    );
  }
  if (!Array.isArray(v.probes) || v.probes.length === 0) {
    throw new Error(`${WEB_DETECTOR_ID}: stored artifact has no probe statuses, so its coverage cannot be established.`);
  }
  return value as WebArtifact;
}
