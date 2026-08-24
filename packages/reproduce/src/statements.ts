/**
 * Every sentence the pipeline can put in front of a reader, built in one place.
 *
 * The asymmetry is the product (`market-check-reproduction.md`, "What 'failed to reproduce' means
 * as evidence"): strong and concrete on success, a receipt of our own attempt on failure, and
 * never "this is human", never a green check, never a human score. Holding the copy here rather
 * than at the call sites means the guard runs on all of it: every function below ends in
 * `assertPermitted`, so a sentence that makes a claim about somebody else's artifact throws at
 * construction rather than rendering.
 */

import { fmtSeconds, fmtUsd } from "./budget.js";
import { assertPermitted } from "./claims.js";
import type { ConfounderCode, RefusalCode, Totals } from "./types.js";

/**
 * The headline. One measured duration, one measured price, and a pointer to the receipt.
 *
 * Note what is absent: any adjective describing the submitted artifact, any comparison to a human
 * timeline stated as fact (the "about a day" line in the spec is an editorial estimate and does
 * not belong in a generated sentence), and any invitation to infer.
 */
export function successStatement(totals: Totals): string {
  return assertPermitted(
    `We remade this in ${fmtSeconds(totals.elapsedMs)}, for ${fmtUsd(totals.costUsd)}, using the model and the prompt printed on this receipt.`,
  );
}

export const SUCCESS_CAVEAT = assertPermitted(
  [
    "One fact is shown here: an artifact of this kind is cheap for us to remake.",
    "It is not evidence about how the submitted artifact came to exist, and we make no claim about any person.",
  ].join(" "),
);

/**
 * The failure headline.
 *
 * "We could not reproduce this" plus the literal cost of trying. The cost is not decoration: the
 * source research argues that reporting the spend on a failure is what keeps the tool honest,
 * because it prices the attempt instead of implying a conclusion.
 */
export function couldNotReproduceStatement(totals: Totals): string {
  return assertPermitted(
    `We could not remake this. ${totals.attempts} attempt(s), ${fmtSeconds(totals.elapsedMs)}, ${fmtUsd(totals.costUsd)} spent.`,
  );
}

export const COULD_NOT_REPRODUCE_CAVEAT = assertPermitted(
  [
    "A failed attempt of ours is not evidence about the submitted artifact.",
    "At least five explanations remain open and this run ruled out none of them.",
    "Absence of a finding here is not a finding.",
  ].join(" "),
);

/**
 * The five confounders in reader-facing words.
 *
 * Every one of them is phrased as a limit on US. `expensive_human_work` is deliberately the flattest
 * sentence in the set, because it is the least likely explanation on any given failure and the one
 * a reader most wants to promote to a conclusion.
 */
export const CONFOUNDER_TEXT: Readonly<Record<ConfounderCode, string>> = {
  prompt_inversion_quality: assertPermitted(
    "The prompt we wrote from the artifact may simply not have been good enough. On the research this is by far the most common reason a remake misses.",
  ),
  provider_safety_refusal: assertPermitted(
    "A provider content filter declined the request. That is a fact about the filter and says nothing about the artifact.",
  ),
  model_capability_gap: assertPermitted(
    "The artifact may need something our models do not do well: exact typography, long text inside an image, a specific product, a real place.",
  ),
  generator_inaccessible: assertPermitted(
    "Some services cannot be called at all from here. One of the most widely used image services has no API and forbids automation, so it is permanently out of reach for us.",
  ),
  expensive_human_work: assertPermitted(
    "Work of this kind can take a long time by hand. This run did not test for that and cannot tell it apart from the four lines above.",
  ),
};

/** Refusal copy, one per code. The reason is always something WE did or could not do. */
export const REFUSAL_TEXT: Readonly<Record<RefusalCode, string>> = {
  identifiable_face_present: assertPermitted(
    "We did not run this. Our face check found a face in the submitted pixels, and we do not remake those.",
  ),
  face_check_unavailable: assertPermitted(
    "We did not run this. No face check was available on this build, and we do not send pixels we have not checked.",
  ),
  consent_missing: assertPermitted(
    "We did not run this. We had no consent record on file for regenerating this upload, so nothing was sent anywhere.",
  ),
  consent_scope_insufficient: assertPermitted(
    "We did not run this. The consent record on file does not cover regenerating an artifact, and agreeing to use the service is not the same thing.",
  ),
  consent_expired: assertPermitted(
    "We did not run this. The consent record on file had expired, so nothing was sent anywhere.",
  ),
  consent_artifact_mismatch: assertPermitted(
    "We did not run this. The consent record on file was granted for a different upload and does not transfer.",
  ),
  consent_not_freely_given: assertPermitted(
    "We did not run this. The consent record on file does not carry the affirmative, conscious and voluntary agreement we require.",
  ),
  modality_out_of_scope: assertPermitted(
    "We did not run this. This build handles text, images and sites from a screenshot, and nothing else.",
  ),
  provider_forbidden: assertPermitted(
    "We did not run this. The provider requested is one we do not call, for the reason recorded against it.",
  ),
};

/** The not-configured headline. A statement about our build, never about the artifact. */
export function notConfiguredStatement(missingEnv: readonly string[]): string {
  const tail =
    missingEnv.length === 0
      ? "No provider is wired up for it on this build."
      : `It needs ${missingEnv.length} setting(s) this build does not have: ${missingEnv.join(", ")}.`;
  return assertPermitted(`We did not attempt this. ${tail} Nothing was sent anywhere and nothing was charged.`);
}

/** Deferred-modality copy, for a caller who asks for video or voice. */
export const OUT_OF_SCOPE_DETAIL = assertPermitted(
  [
    "This build attempts text, images, and a site from a screenshot.",
    "Moving image and voice are out of scope here and are recorded as decisions with reasons, not as gaps.",
  ].join(" "),
);
