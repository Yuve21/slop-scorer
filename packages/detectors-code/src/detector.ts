import type { AnalyzeContext, Detector, DetectorResult, Input, RuleDescriptor } from "@slop/core";
import { analyzeRepoArtifact, CODE_DETECTOR_ID } from "./analyze.js";
import { REPO_ARTIFACT_SCHEMA_VERSION } from "./artifact.js";
import type { RepoArtifact } from "./artifact.js";
import { CODE_CORPUS_VERSION, CODE_RULE_DESCRIPTORS, CODE_RULES } from "./rules/index.js";
import { scanRepo } from "./scan.js";
import type { ScanOptions } from "./scan.js";

/** The code `Detector`. Replayable, so a scan can be re-scored against a later corpus. */
export const codeDetector: Detector = {
  id: CODE_DETECTOR_ID,
  modality: "code",
  evidenceKind: "deterministic",
  corpusVersion: CODE_CORPUS_VERSION,
  accepts: ["repo", "artifact"],
  replayable: true,
  rules: CODE_RULE_DESCRIPTORS as readonly RuleDescriptor[],

  canHandle(input: Input): boolean {
    if (input.kind === "repo") return input.path.length > 0;
    return input.kind === "artifact" && input.detectorId === CODE_DETECTOR_ID;
  },

  async analyze(input: Input, ctx?: AnalyzeContext): Promise<DetectorResult> {
    const now = ctx?.now;
    if (input.kind === "artifact") {
      return analyzeRepoArtifact(asRepoArtifact(input.artifact), input, {
        rules: CODE_RULES,
        ...(now ? { now } : {}),
      });
    }
    if (input.kind !== "repo") {
      throw new Error(`${CODE_DETECTOR_ID} cannot handle input of kind "${input.kind}".`);
    }
    const artifact = await scanRepo(input.path, (ctx?.options ?? {}) as ScanOptions);
    return analyzeRepoArtifact(artifact, input, { rules: CODE_RULES, ...(now ? { now } : {}) });
  },
};

/**
 * Replay guard. A stored scan from an older schema is not "mostly fine": its missing fields
 * read as absent tells, so it would score lower against a newer corpus for a reason that has
 * nothing to do with the repository.
 */
export function asRepoArtifact(value: unknown): RepoArtifact {
  if (!value || typeof value !== "object") {
    throw new Error(`${CODE_DETECTOR_ID}: replay input is not an object.`);
  }
  const v = value as { schemaVersion?: unknown; probes?: unknown };
  if (v.schemaVersion !== REPO_ARTIFACT_SCHEMA_VERSION) {
    throw new Error(
      `${CODE_DETECTOR_ID}: stored artifact is schema v${String(v.schemaVersion)}, this build reads v${REPO_ARTIFACT_SCHEMA_VERSION}. Re-scan rather than replay.`,
    );
  }
  if (!Array.isArray(v.probes) || v.probes.length === 0) {
    throw new Error(`${CODE_DETECTOR_ID}: stored artifact has no probe statuses, so its coverage cannot be established.`);
  }
  return value as RepoArtifact;
}
