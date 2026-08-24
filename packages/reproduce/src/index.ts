/**
 * @slop/reproduce
 *
 * The reproduction pipeline. Given something somebody submitted, attempt a close remake and report
 * the effort gap - our elapsed seconds, our cost, our model, our prompt. It is a demonstration of
 * what is cheap to make, never an accusation about how anything was made.
 *
 * The four things a reader of this file should take away:
 *
 *  - THE RESULT IS A FOUR-ARM UNION. `succeeded | could_not_reproduce | refused | not_configured`.
 *    Two of the arms are not errors. A renderer switches on `status` and never parses a sentence.
 *  - NOTHING IN HERE CAN NAME A PERSON. There is no field for a creator, an author or a client, in
 *    any type, and a test walks the source to keep it that way.
 *  - NOTHING IN HERE CAN SAY "THIS IS AI". `assertPermitted` runs over every sentence the package
 *    emits, at construction time, and a test runs it over every string literal in the source.
 *  - IT ALL RUNS WITH NO KEYS AND NO NETWORK. `MockProvider` is the reference implementation of the
 *    provider contract, so the consent gate, the face gate, the budget, the timeout and the export
 *    figure are exercised on every test run rather than on the days somebody has credentials.
 *
 * Real providers need environment variables; `requiredEnvByModality()` lists them. With none set,
 * the pipeline returns `not_configured` and names what is missing. It never crashes and it never
 * invents a result.
 */

/* ---- the pipeline ---------------------------------------------------------------------------- */
export type { PipelineOptions, ReproduceRequest } from "./pipeline.js";
export { ReproductionPipeline } from "./pipeline.js";

/* ---- the contract ---------------------------------------------------------------------------- */
export type {
  ArtifactRef,
  AttemptOutcome,
  ConfounderCode,
  DeferredModality,
  DeferredModalityNote,
  RefusalCode,
  ReproductionAttempt,
  ReproductionInput,
  ReproductionModality,
  ReproductionOutput,
  ReproductionResult,
  Totals,
  TriedEntry,
} from "./types.js";
export { CONFOUNDER_ORDER, DEFERRED_MODALITIES, V1_MODALITIES, ZERO_TOTALS } from "./types.js";

/* ---- providers ------------------------------------------------------------------------------- */
export type { Env, ForbiddenProvider, ReproductionProvider } from "./provider.js";
export { FORBIDDEN_PROVIDERS, ForbiddenProviderError, ProviderRegistry, findForbidden } from "./provider.js";
export type { MockBehaviour, MockProviderOptions } from "./providers/mock.js";
export {
  MockProvider,
  approximateImage,
  approximateSite,
  approximateText,
  countBands,
  derivePrompt,
  seedOf,
} from "./providers/mock.js";
export type { ProviderTransport } from "./providers/real.js";
export { REAL_PROVIDER_SPECS, realProviders, requiredEnvByModality } from "./providers/real.js";

/* ---- the gates ------------------------------------------------------------------------------- */
export type { ConsentCheck, ConsentFailureCode, ConsentRecord, ConsentScope } from "./consent.js";
export {
  CONSENT_DEFINITION,
  CONSENT_STATEMENT_TEXT,
  CONSENT_STATEMENT_VERSION,
  REGENERATION_SCOPE,
  checkConsent,
  grantConsent,
} from "./consent.js";
export type { FaceDetection, FaceDetector, FacePolicy, FaceRegion } from "./faces.js";
export { HeuristicFaceDetector, NoFacesDetector, excludeFaceRegions } from "./faces.js";
export type { ClaimViolation } from "./claims.js";
export {
  FORBIDDEN_CLAIM_PHRASES,
  ForbiddenClaimError,
  PERMITTED_VERBATIM_QUOTATIONS,
  assertPermitted,
  findClaimViolations,
  neutralizeSelfAttribution,
  sentencesOf,
} from "./claims.js";

/* ---- budget, retention, substantiation -------------------------------------------------------- */
export type { AttemptBudget, Budget } from "./budget.js";
export {
  AttemptTimeoutError,
  BudgetExceededError,
  BudgetLedger,
  DEFAULT_BUDGETS,
  fmtSeconds,
  fmtUsd,
} from "./budget.js";
export type { DeletionEvent, RecordKind, RetentionGrant, StoredRecord } from "./retention.js";
export { DEFAULT_TTL_MS, EphemeralStore, MAX_RETENTION_MS } from "./retention.js";
export type { AggregateOptions, SubstantiationAggregate, SubstantiationEntry } from "./substantiation.js";
export { SubstantiationLog, formatAggregate, median } from "./substantiation.js";

/* ---- the figure, and the checks that guard it -------------------------------------------------- */
export type {
  BorderBox,
  ComposedFigure,
  ExportSize,
  FigureLayout,
  FigureSpec,
  PanelSpec,
  ProminenceReport,
  SymmetryReport,
} from "./compose.js";
export {
  DISCLAIMER_BODY,
  DISCLAIMER_HEADING,
  EXPORT_SIZES,
  FigureTooSmallError,
  RECREATION_LABEL,
  SUBMITTED_LABEL,
  checkDisclaimerProminence,
  checkPanelSymmetry,
  composeFigure,
  findEnclosingBorder,
} from "./compose.js";

/* ---- copy ------------------------------------------------------------------------------------- */
export {
  CONFOUNDER_TEXT,
  COULD_NOT_REPRODUCE_CAVEAT,
  OUT_OF_SCOPE_DETAIL,
  REFUSAL_TEXT,
  SUCCESS_CAVEAT,
  couldNotReproduceStatement,
  notConfiguredStatement,
  successStatement,
} from "./statements.js";

/* ---- primitives (a caller composing figures needs these) --------------------------------------- */
export type { Box, Raster, Rgb } from "./raster.js";
export { INK, MUTED, PAPER, PLATE, crop, createRaster, fillRect, getPixel, rastersEqual, setPixel } from "./raster.js";
export type { OcrLine } from "./ocr.js";
export { ocrLines, ocrText } from "./ocr.js";
export { GLYPH_H, GLYPH_W, normalizeForRender } from "./font.js";
export { drawText, glyphHeightPx, measureText } from "./text-render.js";
export type { Clock, DeterministicRuntime, Runtime } from "./runtime.js";
export { FIXED_EPOCH_MS, deterministicRuntime, systemRuntime } from "./runtime.js";
