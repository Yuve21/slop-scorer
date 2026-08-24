/**
 * @slop/core
 *
 * The detector plugin contract and the scoring engine. Pure: no network, no filesystem, no
 * model. Detectors do the I/O and hand back observations; this package turns observations
 * into a receipt that reconciles to a number.
 */

export type {
  AnalyzeContext,
  Coverage,
  Detector,
  DetectorResult,
  Evidence,
  EvidenceKind,
  FamilyId,
  Finding,
  Input,
  InputKind,
  Modality,
  Polarity,
  CounterScope,
  ProbeStatus,
  RuleDescriptor,
  Severity,
} from "./types.js";

export type { Band, FamilySpec, ScoringConfig } from "./config.js";
export { BAND_LABELS, DEFAULT_CONFIG, REPORT_DISCLAIMER, WEB_FAMILIES } from "./config.js";

export type { AbstentionCode, AbstentionReason, AssessmentStatus, VerdictInput } from "./assessment.js";
export {
  ABSTENTION_STATUS,
  FORBIDDEN_VERDICT_PHRASES,
  MAX_SCORE,
  MIN_SCORE,
  verdictSentence,
} from "./assessment.js";

export type { FamilySummary, Receipt, ReceiptLine, Report, ScoreOptions } from "./score.js";
export { buildReport, notAssessed, scoreOf } from "./score.js";

export type {
  CalibrationReport,
  CalibrationRow,
  CorpusCase,
  CorpusLabel,
  Distribution,
  NegativeViolation,
} from "./calibration/index.js";
export {
  assertNegativeCorpus,
  bandRank,
  checkNegativeCorpus,
  formatCalibration,
  runCalibration,
} from "./calibration/index.js";

export type {
  BacktestResult,
  BacktestRow,
  BacktestVerdict,
  Baseline,
  BaselineEntry,
} from "./calibration/backtest.js";
export {
  backtest,
  BASELINE_FORMAT_VERSION,
  formatBacktest,
  makeBaseline,
  toBaselineEntries,
} from "./calibration/backtest.js";

export type { DeepPartial, Remediator, Rule, RuleContext, RuleFixtureCase } from "./rule.js";
export { attachRemedies, ev, patch } from "./rule.js";

export type {
  Applicability,
  BlastRadius,
  DeleteFileRemediation,
  InsertRemediation,
  ManualRemediation,
  Remediation,
  RemediationKind,
  ReplaceFileRemediation,
  ReplaceRangeRemediation,
  UiChangeRemediation,
} from "./remediation.js";
export {
  applicabilityOf,
  assertWellFormedRemediation,
  assertWithinTarget,
  isApplicable,
  isDestructive,
  MAX_PATCH_BYTES,
  MAX_REMEDIATION_PATH_LENGTH,
  pathOf,
  REMEDIATION_KINDS,
} from "./remediation.js";

export type { SanitizeOptions } from "./untrusted.js";
export {
  fenceUntrusted,
  isSecretFile,
  redactSecrets,
  sanitizeUntrusted,
  SECRET_FILE_RE,
  stripControlCharacters,
  UNTRUSTED_CONTENT_WARNING,
  UNTRUSTED_EVIDENCE_FIELDS,
  UNTRUSTED_TEXT_CAP,
} from "./untrusted.js";

export { formatReceipt } from "./receipt.js";
export { makeFinding } from "./finding.js";
export { DetectorRegistry } from "./registry.js";
export { assertWellFormedResult } from "./validate.js";
export { clamp, logit, multiplicity, positionDecay, sigmoid } from "./math.js";
export {
  MalformedResultError,
  NoDetectorError,
  ReceiptMismatchError,
  SlopError,
  VacuousProbeError,
} from "./errors.js";
