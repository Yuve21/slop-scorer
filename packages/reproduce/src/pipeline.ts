/**
 * The pipeline: the order the gates run in, and what happens when one of them says no.
 *
 * THE ORDER IS THE DESIGN. Reading it top to bottom is the fastest way to audit this package:
 *
 *   1. SCOPE.    Video and voice are refused at the door, by code, not by a type that a JSON
 *                boundary would erase.
 *   2. CONSENT.  Typed, clickwrap-shaped, scoped to regeneration, scoped to this artifact, unexpired.
 *                No consent, no call - and it is checked before we so much as look at the pixels.
 *   3. FACES.    Detected BEFORE any regeneration, and the gate FAILS CLOSED: no detector means a
 *                refusal, not a pass. On a hit we either decline outright or mask the region and say
 *                so in the result.
 *   4. PROVIDERS. Nothing configured means `not_configured`, naming the environment variables, with
 *                zero attempts and zero cost. Never a crash and never a fabricated result.
 *   5. BUDGET.   Every call is priced BEFORE it is made and refused if it would cross the ceiling.
 *   6. ATTEMPTS. Each one is logged for substantiation whatever its outcome.
 *
 * Steps 2 and 3 are before step 4 on purpose. The cheap ordering would test whether a call is even
 * possible first, but then the two controls that exist for legal reasons would go untested on every
 * build with no keys - which is every build. Here they run on every request, always.
 */

import type { AttemptBudget, Budget } from "./budget.js";
import { AttemptTimeoutError, BudgetLedger, DEFAULT_BUDGETS } from "./budget.js";
import { assertPermitted } from "./claims.js";
import type { ConsentRecord } from "./consent.js";
import { REGENERATION_SCOPE, checkConsent } from "./consent.js";
import type { FaceDetection, FaceDetector, FacePolicy } from "./faces.js";
import { excludeFaceRegions } from "./faces.js";
import type { Env, ProviderRegistry, ReproductionProvider } from "./provider.js";
import type { Raster } from "./raster.js";
import type { Clock, Runtime } from "./runtime.js";
import { systemRuntime } from "./runtime.js";
import { EphemeralStore } from "./retention.js";
import {
  COULD_NOT_REPRODUCE_CAVEAT,
  OUT_OF_SCOPE_DETAIL,
  REFUSAL_TEXT,
  SUCCESS_CAVEAT,
  couldNotReproduceStatement,
  notConfiguredStatement,
  successStatement,
} from "./statements.js";
import { SubstantiationLog } from "./substantiation.js";
import type {
  RefusalCode,
  ReproductionAttempt,
  ReproductionInput,
  ReproductionModality,
  ReproductionResult,
  Totals,
  TriedEntry,
} from "./types.js";
import { CONFOUNDER_ORDER, V1_MODALITIES, ZERO_TOTALS } from "./types.js";

export interface ReproduceRequest {
  readonly input: ReproductionInput;
  /** Absent is a refusal, not a default. */
  readonly consent?: ConsentRecord;
  readonly budget?: Budget;
  readonly env?: Env;
  readonly facePolicy?: FacePolicy;
}

export interface PipelineOptions {
  readonly registry: ProviderRegistry;
  /**
   * Absent means every raster request is refused with `face_check_unavailable`.
   *
   * Optional in the type and mandatory in effect. Making it required would let a caller satisfy the
   * compiler with a detector that returns nothing; leaving it optional and failing closed makes the
   * absence visible in the result instead.
   */
  readonly faceDetector?: FaceDetector;
  readonly runtime?: Runtime;
  readonly store?: EphemeralStore;
  readonly log?: SubstantiationLog;
  /** Default `refuse`. `exclude` masks the region and records that it did. */
  readonly facePolicy?: FacePolicy;
  readonly budgets?: Partial<Record<ReproductionModality, Budget>>;
}

const rasterOf = (input: ReproductionInput): Raster | null =>
  input.modality === "text" ? null : input.raster;

const withRaster = (input: ReproductionInput, raster: Raster): ReproductionInput =>
  input.modality === "text" ? input : { ...input, raster };

class Attempt implements AttemptBudget {
  readonly signal: AbortSignal;
  private readonly controller = new AbortController();

  constructor(
    readonly attemptId: string,
    readonly maxCostUsd: number,
    readonly deadlineAtMs: number,
    readonly clock: Clock,
    private readonly runtime: Runtime,
  ) {
    this.signal = this.controller.signal;
  }

  sleep(ms: number): Promise<void> {
    return this.runtime.sleep(ms, this.signal);
  }

  /**
   * The hard timeout, enforced against the same clock the elapsed figure is measured on.
   *
   * It aborts as well as throwing. A provider that ignores the exception still loses its signal,
   * so a real HTTP client is cancelled rather than left to finish and bill us for an answer we have
   * already recorded as a timeout.
   */
  checkpoint(): void {
    const now = this.clock.now();
    if (now <= this.deadlineAtMs) return;
    const error = new AttemptTimeoutError(this.deadlineAtMs, now);
    this.controller.abort(error);
    throw error;
  }
}

export class ReproductionPipeline {
  private readonly runtime: Runtime;
  readonly store: EphemeralStore;
  readonly log: SubstantiationLog;

  constructor(private readonly options: PipelineOptions) {
    this.runtime = options.runtime ?? systemRuntime();
    this.store = options.store ?? new EphemeralStore();
    this.log = options.log ?? new SubstantiationLog();
  }

  async run(request: ReproduceRequest): Promise<ReproductionResult> {
    const { input } = request;
    const requestId = this.runtime.id("req");
    const modality = input.modality;

    /* 1. Scope. */
    if (!V1_MODALITIES.includes(modality)) {
      return this.refuse(requestId, modality, "modality_out_of_scope", OUT_OF_SCOPE_DETAIL);
    }

    /* 2. Consent, before anything touches the artifact. */
    const consent = checkConsent(request.consent, input.artifact.artifactId, this.runtime.clock.now(), [
      REGENERATION_SCOPE,
      "transmit_to_provider",
    ]);
    if (!consent.ok) return this.refuse(requestId, modality, consent.code, consent.detail);
    const consentId = (request.consent as ConsentRecord).consentId;

    /* 3. Faces, before any regeneration. Fails closed. */
    const pixels = rasterOf(input);
    let detection: FaceDetection = {
      detectorId: "not-applicable-no-pixels",
      regions: [],
      method: "the text path carries no pixels, so there is nothing to check",
    };
    let effectiveInput = input;
    let faceRegionsExcluded = false;
    if (pixels !== null) {
      const detector = this.options.faceDetector;
      if (detector === undefined) {
        return this.refuse(
          requestId,
          modality,
          "face_check_unavailable",
          REFUSAL_TEXT.face_check_unavailable,
        );
      }
      detection = await detector.detect(pixels);
      if (detection.regions.length > 0) {
        const policy: FacePolicy = request.facePolicy ?? this.options.facePolicy ?? "refuse";
        if (policy === "refuse") {
          return this.refuse(
            requestId,
            modality,
            "identifiable_face_present",
            // Built rather than fixed, because it carries a count and a detector id - so it goes
            // through the claims guard on the way out like every other sentence.
            assertPermitted(
              `Our check found ${detection.regions.length} region(s) using "${detection.detectorId}" (${detection.method}), so no call was made.`,
            ),
          );
        }
        effectiveInput = withRaster(input, excludeFaceRegions(pixels, detection.regions));
        faceRegionsExcluded = true;
      }
    }

    /* 4. Providers. */
    const env = request.env ?? {};
    const providers = this.options.registry.configuredFor(modality, env);
    if (providers.length === 0) {
      const missingEnv = this.options.registry.missingEnvFor(modality, env);
      return {
        status: "not_configured",
        requestId,
        modality,
        missingEnv,
        detail: notConfiguredStatement(missingEnv),
        attempts: [],
        totals: ZERO_TOTALS,
        statement: notConfiguredStatement(missingEnv),
      };
    }

    /* 5 and 6. Budget, then attempts. */
    const budget = request.budget ?? this.options.budgets?.[modality] ?? DEFAULT_BUDGETS[modality];
    const ledger = new BudgetLedger(budget, this.runtime.clock);
    const attempts: ReproductionAttempt[] = [];
    const tried: TriedEntry[] = [];

    for (const provider of providers) {
      const estimate = provider.estimateCost(effectiveInput);
      const admitted = ledger.admits(estimate);
      if (!admitted.ok) {
        tried.push({
          providerId: provider.id,
          model: provider.model,
          outcome: "budget_exceeded",
          elapsedMs: 0,
          costUsd: 0,
          note: `no call was made: ${admitted.reason}`,
        });
        break;
      }

      const attempt = await this.callProvider(provider, effectiveInput, ledger, faceRegionsExcluded);
      attempts.push(attempt);
      ledger.record(attempt.costUsd);
      tried.push({
        providerId: attempt.providerId,
        model: attempt.model,
        outcome: attempt.outcome,
        elapsedMs: attempt.elapsedMs,
        costUsd: attempt.costUsd,
        ...(attempt.refusalNote === undefined ? {} : { note: attempt.refusalNote }),
      });
      this.log.record({
        requestId,
        attempt,
        artifactSha256: input.artifact.sha256,
        artifactMediaType: input.artifact.mediaType,
        artifactByteLength: input.artifact.byteLength,
        consentId,
        faceDetectorId: detection.detectorId,
        faceDetectorProductionGrade: this.options.faceDetector?.productionGrade ?? false,
        publishableInComparisons: provider.publishableInComparisons,
      });

      if (attempt.outcome === "produced") {
        const totals = totalsOf(attempts);
        this.retain(requestId, input, attempt);
        return {
          status: "succeeded",
          requestId,
          modality,
          attempt,
          attempts,
          totals,
          statement: successStatement(totals),
          caveat: SUCCESS_CAVEAT,
          faceRegionsExcluded,
        };
      }
    }

    const totals = totalsOf(attempts);
    return {
      status: "could_not_reproduce",
      requestId,
      modality,
      attempts,
      tried,
      // All five, always, in the source document's order. A failed remake rules none of them out,
      // and a shortened list would be read as a diagnosis - which is the exact inference this arm
      // of the union exists to prevent.
      confounders: CONFOUNDER_ORDER,
      totals,
      statement: couldNotReproduceStatement(totals),
      caveat: COULD_NOT_REPRODUCE_CAVEAT,
    };
  }

  private async callProvider(
    provider: ReproductionProvider,
    input: ReproductionInput,
    ledger: BudgetLedger,
    faceRegionsExcluded: boolean,
  ): Promise<ReproductionAttempt> {
    const clock = this.runtime.clock;
    const attemptId = this.runtime.id("att");
    const startedAt = clock.iso();
    const startedAtMs = clock.now();
    // The smaller of the provider's own ceiling and whatever is left in the request.
    const deadlineAtMs = startedAtMs + Math.min(provider.hardTimeoutMs, ledger.remainingMs);
    const budget = new Attempt(attemptId, ledger.remainingCostUsd, deadlineAtMs, clock, this.runtime);

    const base = {
      attemptId,
      providerId: provider.id,
      model: provider.model,
      modality: provider.modality,
      startedAt,
      faceRegionsExcluded,
    };
    try {
      const attempt = await provider.reproduce(input, budget);
      return { ...attempt, faceRegionsExcluded };
    } catch (error) {
      const finishedAt = clock.iso();
      const elapsedMs = clock.now() - startedAtMs;
      if (error instanceof AttemptTimeoutError) {
        return {
          ...base,
          prompt: "",
          parameters: { deadlineAtMs, hardTimeoutMs: provider.hardTimeoutMs },
          finishedAt,
          elapsedMs,
          // A provider that ran past its deadline may still bill us, so the declared per-call price
          // is charged to the ledger rather than pretending an aborted call was free.
          costUsd: provider.declaredCostUsdPerCall,
          outcome: "timeout",
          refusalNote: error.message,
        };
      }
      return {
        ...base,
        prompt: "",
        parameters: {},
        finishedAt,
        elapsedMs,
        costUsd: 0,
        outcome: "error",
        refusalNote: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Hold the upload, the prompt and the recreation, briefly, with the derivation edges intact.
   *
   * The edges are the point. `deleteOnNotice(artifactId)` walks them, so a takedown of the upload
   * takes the prompt and the recreation with it - the partial-compliance failure named in
   * `retention.ts`. The TTL is the easy half.
   */
  private retain(requestId: string, input: ReproductionInput, attempt: ReproductionAttempt): void {
    const nowMs = this.runtime.clock.now();
    const uploadId = input.artifact.artifactId;
    if (this.store.get(uploadId, nowMs) === undefined) {
      this.store.put({ id: uploadId, kind: "upload", value: input.artifact, nowMs });
    }
    const promptId = `${requestId}:prompt`;
    this.store.put({ id: promptId, kind: "prompt", value: attempt.prompt, nowMs, derivedFrom: uploadId });
    if (attempt.output !== undefined) {
      this.store.put({
        id: `${requestId}:recreation`,
        kind: "recreation",
        value: attempt.output,
        nowMs,
        derivedFrom: promptId,
      });
    }
  }

  private refuse(
    requestId: string,
    modality: ReproductionModality,
    refusal: RefusalCode,
    detail: string,
  ): ReproductionResult {
    return {
      status: "refused",
      requestId,
      modality,
      refusal,
      detail,
      attempts: [],
      totals: ZERO_TOTALS,
      statement: REFUSAL_TEXT[refusal],
    };
  }
}

function totalsOf(attempts: readonly ReproductionAttempt[]): Totals {
  return {
    attempts: attempts.length,
    elapsedMs: attempts.reduce((sum, a) => sum + a.elapsedMs, 0),
    costUsd: Math.round(attempts.reduce((sum, a) => sum + a.costUsd, 0) * 10_000) / 10_000,
  };
}
