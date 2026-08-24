/**
 * @slop/detectors-code
 *
 * "Is this repository template-shaped?", answered with citable, deterministic evidence.
 * Every rule cites a path and a line the reader can open. Nothing here is a model output,
 * and no LLM is a dependency of this package.
 */

export type {
  AgentFileRecord,
  FileRole,
  CommentRecord,
  CommitRecord,
  ConfigRecord,
  DependencyRecord,
  DuplicateBlock,
  FunctionRecord,
  PlaceholderRecord,
  ProbeId,
  ReadmeRecord,
  RepoArtifact,
  SourceFileRecord,
  TestFileRecord,
} from "./artifact.js";
export { allProbesRan, livedInHistory, neutralRepo, PROBE_WEIGHTS, REPO_ARTIFACT_SCHEMA_VERSION } from "./artifact.js";

export type { CodeRule, RuleContext, RuleFixtureCase } from "./rule.js";
export { ev, patch } from "./rule.js";

export { CODE_CONFIG, CODE_FAMILIES } from "./families.js";

export { analyzeRepoArtifact, CODE_DETECTOR_ID, coverageOf } from "./analyze.js";

export type { ScanOptions } from "./scan.js";
export { scanRepo } from "./scan.js";

export { asRepoArtifact, codeDetector } from "./detector.js";

export type { RemovedRecord, SuppressionRecord, Suppressor } from "./suppression.js";
export {
  CODE_SUPPRESSORS,
  fixtureData,
  formatSuppressions,
  pruneArtifact,
  selfDefiningPattern,
} from "./suppression.js";

export {
  AGENT_RULES,
  CODE_CORPUS_VERSION,
  CODE_COUNTER_RULES,
  CODE_RULE_DESCRIPTORS,
  CODE_RULES,
  codeRuleById,
  COMMENT_RULES,
  HISTORY_RULES,
  SCAFFOLD_RULES,
  UNIFORMITY_RULES,
  VERIFICATION_RULES,
} from "./rules/index.js";
