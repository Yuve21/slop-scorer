/**
 * The reproduction contract.
 *
 * The mechanic: given an artifact somebody submitted, attempt a close approximation and report
 * the effort gap - elapsed seconds and cost, for OUR attempt. The output is a demonstration.
 * It is never an accusation, and the types below are the first place that is enforced.
 *
 * Three properties of this file are load-bearing rather than stylistic:
 *
 *  1. THERE IS NO FIELD FOR A CREATOR, A CLIENT OR A VENDOR OF THE SUBMITTED ARTIFACT. Anywhere.
 *     Defamation and false light both require that the plaintiff be identified
 *     (`publicity-defamation-risk.md` Tier 1 #1), so the cheapest possible control is to make the
 *     information unrepresentable. `providerId` and `model` name OUR suppliers, which is the
 *     opposite direction of travel. A test walks this package's source for creator-shaped field
 *     names, because the control is only as good as its enforcement.
 *
 *  2. THE RESULT IS A DISCRIMINATED UNION WITH FOUR ARMS, and the two failure arms are not
 *     errors. `could_not_reproduce` is a receipt of our attempt; `not_configured` is a statement
 *     about our build. A renderer switches on `status` and never parses a sentence.
 *
 *  3. FAILURE CARRIES ITS CONFOUNDERS AS AN ENUM. `market-check-reproduction.md` sets out the
 *     five reasons a remake fails and observes that only one of them is interesting and it is the
 *     least likely. Modelling them as a list of explanations we could not rule out - rather than
 *     as a diagnosis - is what stops "we could not reproduce this" from being read as "a person
 *     made this".
 */

import type { Raster } from "./raster.js";

/** Shipping at v1. Cheap, fast enough to feel synchronous, and the least legally fraught. */
export type ReproductionModality = "text" | "image" | "website-from-screenshot";

export const V1_MODALITIES: readonly ReproductionModality[] = ["text", "image", "website-from-screenshot"];

/** Deliberately not shipped. Named here so the gap is a decision on the record, not an omission. */
export type DeferredModality = "video" | "voice";

export interface DeferredModalityNote {
  readonly modality: DeferredModality;
  readonly reason: string;
  readonly source: string;
}

/**
 * Extension points, with the reason each one is closed.
 *
 * Neither has a stub implementation. A provider that returns a plausible-looking placeholder for
 * a modality we cannot actually serve is worse than the absence, because the placeholder is what
 * ends up in a screenshot.
 */
export const DEFERRED_MODALITIES: readonly DeferredModalityNote[] = [
  {
    modality: "video",
    reason:
      "Per-clip cost and a tail latency measured in minutes rather than seconds break the promise the product makes. Revisit as an asynchronous, paid, signed-in job with its own budget, not as part of the synchronous path.",
    source: "market-check-reproduction.md (c), (e)",
  },
  {
    modality: "voice",
    reason:
      "Cloning is closed contractually rather than technically: the vendor's own terms state that consent from the subject is not sufficient. A synthetic voice reading the same words is a different demonstration and would need its own framing before it could ship.",
    source: "market-check-reproduction.md (c) blocker 3",
  },
];

/**
 * A content-addressed handle on something somebody submitted.
 *
 * Digest and byte length only. Not a filename, not an origin URL, not EXIF: source metadata is
 * stripped before this type is constructed (`design/SURFACES.md` C), so there is nothing here
 * that identifies a person even if a caller logs the whole object.
 */
export interface ArtifactRef {
  readonly artifactId: string;
  readonly mediaType: string;
  readonly byteLength: number;
  /** Hex sha-256 of the submitted bytes. Also the deterministic seed for the mock provider. */
  readonly sha256: string;
}

export type ReproductionInput =
  | { readonly modality: "text"; readonly artifact: ArtifactRef; readonly text: string }
  | { readonly modality: "image"; readonly artifact: ArtifactRef; readonly raster: Raster }
  | { readonly modality: "website-from-screenshot"; readonly artifact: ArtifactRef; readonly raster: Raster };

/** What a provider handed back. */
export type ReproductionOutput =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "raster"; readonly raster: Raster }
  | { readonly kind: "html"; readonly html: string; readonly preview: Raster };

export type AttemptOutcome =
  /** The provider returned something. */
  | "produced"
  /** The provider declined. A safety filter, a policy, a rights check. */
  | "refused"
  /** The provider was reached and failed. */
  | "error"
  /** The hard timeout fired and the call was aborted rather than left hanging. */
  | "timeout"
  /** The next call would have crossed the budget ceiling, so it was never made. */
  | "budget_exceeded";

/**
 * One call to one provider, with everything the FTC substantiation record needs.
 *
 * *In re Workado* requires the evidence to exist at the time the claim is made and every time it
 * is repeated. Every published "we remade this in N seconds for $X" is a claim, so the fields
 * that substantiate it are captured on the attempt itself and not reconstructed later.
 */
export interface ReproductionAttempt {
  readonly attemptId: string;
  readonly providerId: string;
  readonly model: string;
  readonly modality: ReproductionModality;
  /** The prompt WE wrote. Shown in the receipt; there is no hidden prompt. */
  readonly prompt: string;
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly elapsedMs: number;
  readonly costUsd: number;
  readonly outcome: AttemptOutcome;
  /** Verbatim, when a provider declined. Never paraphrased into a claim about the artifact. */
  readonly refusalNote?: string;
  /** The provider's own read on why it failed. Advisory; the pipeline never treats it as proof. */
  readonly confounder?: ConfounderCode;
  readonly output?: ReproductionOutput;
  /** True when a face region was masked out of the input before the call. */
  readonly faceRegionsExcluded?: boolean;
}

/**
 * The five ways a failed remake is confounded.
 *
 * Ordered as the source document orders them, by how likely each is to be the real explanation.
 * `expensive_human_work` is last for a reason and the UI must never promote it.
 */
export type ConfounderCode =
  /** Our prompt inversion was not good enough. By far the most common cause. */
  | "prompt_inversion_quality"
  /** A provider safety filter declined. Says nothing about the artifact. */
  | "provider_safety_refusal"
  /** The artifact needs a capability our models lack: exact type, a real place, a real product. */
  | "model_capability_gap"
  /** The likely generator is unreachable to us: no API, a bespoke fine-tune, a closed service. */
  | "generator_inaccessible"
  /** Work of this kind can take a person a long time. Least likely, and we did not test for it. */
  | "expensive_human_work";

export const CONFOUNDER_ORDER: readonly ConfounderCode[] = [
  "prompt_inversion_quality",
  "provider_safety_refusal",
  "model_capability_gap",
  "generator_inaccessible",
  "expensive_human_work",
];

/** Why the pipeline declined to make any call at all. */
export type RefusalCode =
  /** A face was found in the submitted pixels and the policy is to decline. */
  | "identifiable_face_present"
  /** No face check was available, and the pipeline fails closed rather than open. */
  | "face_check_unavailable"
  | "consent_missing"
  | "consent_scope_insufficient"
  | "consent_expired"
  | "consent_artifact_mismatch"
  | "consent_not_freely_given"
  /** The modality is out of scope for this build (video, voice). */
  | "modality_out_of_scope"
  /** A provider on the forbidden list was requested. */
  | "provider_forbidden";

export interface Totals {
  readonly attempts: number;
  readonly elapsedMs: number;
  readonly costUsd: number;
}

/** What was tried, in the literal terms the failure state has to be able to list. */
export interface TriedEntry {
  readonly providerId: string;
  readonly model: string;
  readonly outcome: AttemptOutcome;
  readonly elapsedMs: number;
  readonly costUsd: number;
  readonly note?: string;
}

export type ReproductionResult =
  | {
      readonly status: "succeeded";
      readonly requestId: string;
      readonly modality: ReproductionModality;
      readonly attempt: ReproductionAttempt;
      readonly attempts: readonly ReproductionAttempt[];
      readonly totals: Totals;
      /** The one sentence the caller may render as a headline. Pre-checked by `claims.ts`. */
      readonly statement: string;
      readonly caveat: string;
      /** Set when the input had a face region masked before the call. */
      readonly faceRegionsExcluded: boolean;
    }
  | {
      readonly status: "could_not_reproduce";
      readonly requestId: string;
      readonly modality: ReproductionModality;
      readonly attempts: readonly ReproductionAttempt[];
      readonly tried: readonly TriedEntry[];
      /** Explanations we could not rule out. Never a diagnosis, never ranked as one. */
      readonly confounders: readonly ConfounderCode[];
      readonly totals: Totals;
      readonly statement: string;
      readonly caveat: string;
    }
  | {
      readonly status: "refused";
      readonly requestId: string;
      readonly modality: ReproductionModality;
      readonly refusal: RefusalCode;
      readonly detail: string;
      readonly attempts: readonly [];
      readonly totals: Totals;
      readonly statement: string;
    }
  | {
      readonly status: "not_configured";
      readonly requestId: string;
      readonly modality: ReproductionModality;
      /** Environment variables a real provider for this modality would need. */
      readonly missingEnv: readonly string[];
      readonly detail: string;
      readonly attempts: readonly [];
      readonly totals: Totals;
      readonly statement: string;
    };

export const ZERO_TOTALS: Totals = { attempts: 0, elapsedMs: 0, costUsd: 0 };
