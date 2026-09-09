/**
 * Written consent, captured before any provider call. No consent, no call.
 *
 * the legal risk memo (private) Tier 1 #5 calls this "the cheapest defence in the memo,
 * defends against the most statutes": it defeats the scienter element of the Tennessee ELVIS Act
 * tool prong and the Utah equivalent, and the "without consent" element of the California and
 * Washington publicity statutes, all at once.
 *
 * The definition is not ours. It is the TAKE IT DOWN Act's, quoted verbatim below, and the four
 * booleans on the record are that sentence decomposed into fields a machine can check. Decomposing
 * it is the point: a single `consented: true` flag records that somebody clicked, whereas these
 * record WHAT was represented, which is the thing a court asks about.
 *
 * Consent is scoped to one artifact and one purpose and it expires. A consent that covers "using
 * the service" does not cover regenerating a specific upload, and `checkConsent` will not accept
 * one that tries.
 */

/** Quoted from the statute. Shown in the clickwrap and stored with every record. */
export const CONSENT_DEFINITION =
  "affirmative, conscious, and voluntary authorization, free from force, fraud, duress, misrepresentation, or coercion";

export type ConsentScope =
  /** Send the artifact to a third-party model provider. */
  | "transmit_to_provider"
  /** Produce a close approximation of the artifact with a generative model. */
  | "regenerate"
  /** Compose the submitted artifact and the approximation into one exportable figure. */
  | "compose_side_by_side"
  /** Keep the artifact or anything derived from it beyond the default ephemeral window. */
  | "retain_beyond_default_ttl";

/** The scope that actually gates the pipeline. Named separately so a reader cannot miss it. */
export const REGENERATION_SCOPE: ConsentScope = "regenerate";

export interface ConsentRecord {
  readonly consentId: string;
  /** Consent is per artifact. A record for a different upload does not transfer. */
  readonly artifactId: string;
  readonly grantedAt: string;
  readonly expiresAt: string;
  readonly scopes: readonly ConsentScope[];
  /** The clickwrap version, so the exact words shown can be reproduced later. */
  readonly statementVersion: string;
  /** The exact words shown, stored rather than referenced. Versions get edited. */
  readonly statementText: string;
  /** Clickwrap, i.e. an affirmative act against displayed terms. Not browsewrap. */
  readonly method: "clickwrap";
  /** The statutory definition, decomposed. All four must be true. */
  readonly affirmative: boolean;
  readonly conscious: boolean;
  readonly voluntary: boolean;
  readonly freeFromCoercion: boolean;
  /**
   * The submitter represents that they hold the rights, or are the subject.
   *
   * This is the representation that makes the Tennessee tool-prong scienter element fail on its
   * face, and it is also the rights warranty every model vendor pushes onto us.
   */
  readonly submitterAssertsRights: boolean;
}

export type ConsentFailureCode =
  | "consent_missing"
  | "consent_scope_insufficient"
  | "consent_expired"
  | "consent_artifact_mismatch"
  | "consent_not_freely_given";

export type ConsentCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: ConsentFailureCode; readonly detail: string };

/**
 * The clickwrap text. Regeneration is named in it, in the first line, in plain words.
 *
 * NO FAKES §2(c)(2)(B)(iii) turns on how a tool is "marketed, advertised, or otherwise promoted",
 * so this text describes an operation on an artifact and never on a person. It also passes the
 * claims guard: everything it says is about what WE will do.
 */
export const CONSENT_STATEMENT_VERSION = "consent-2026.09";
export const CONSENT_STATEMENT_TEXT = [
  "Regeneration. We will send this artifact to one or more third-party model providers and ask them to produce a close approximation of it. That approximation is made by us, moments later, and it is machine output.",
  "Faces. We check the submitted pixels for faces first. If we find one we decline, or we mask the region before sending anything.",
  "What we will show. Elapsed time, cost, the model, the prompt, and the approximation. We do not name anyone and we make no claim about how the submitted artifact came to exist.",
  "Retention. Nothing is kept past a short window unless retention is asked for explicitly, and anything kept can be deleted on notice along with everything derived from it.",
  `Authorization must be ${CONSENT_DEFINITION}.`,
].join("\n\n");

export function checkConsent(
  consent: ConsentRecord | undefined,
  artifactId: string,
  nowMs: number,
  required: readonly ConsentScope[] = [REGENERATION_SCOPE, "transmit_to_provider"],
): ConsentCheck {
  if (consent === undefined) {
    return { ok: false, code: "consent_missing", detail: "No consent record was presented, so no call was made." };
  }
  if (consent.artifactId !== artifactId) {
    return {
      ok: false,
      code: "consent_artifact_mismatch",
      detail: "The consent record on file was granted for a different artifact, so it was not used.",
    };
  }
  const missing = required.filter((s) => !consent.scopes.includes(s));
  if (missing.length > 0) {
    return {
      ok: false,
      code: "consent_scope_insufficient",
      detail: `The consent record does not cover: ${missing.join(", ")}. Consent to use the service is not consent to regenerate an artifact.`,
    };
  }
  if (Date.parse(consent.expiresAt) <= nowMs) {
    return { ok: false, code: "consent_expired", detail: "The consent record had expired, so no call was made." };
  }
  if (!(consent.affirmative && consent.conscious && consent.voluntary && consent.freeFromCoercion)) {
    return {
      ok: false,
      code: "consent_not_freely_given",
      detail: `The consent record does not record authorization that is ${CONSENT_DEFINITION}.`,
    };
  }
  if (!consent.submitterAssertsRights) {
    return {
      ok: false,
      code: "consent_not_freely_given",
      detail: "The consent record carries no representation of rights in the submitted artifact, so no call was made.",
    };
  }
  return { ok: true };
}

/** Build a well-formed record from a clickwrap acceptance. The only supported construction path. */
export function grantConsent(params: {
  readonly consentId: string;
  readonly artifactId: string;
  readonly nowMs: number;
  readonly ttlMs: number;
  readonly scopes: readonly ConsentScope[];
  readonly submitterAssertsRights: boolean;
}): ConsentRecord {
  return {
    consentId: params.consentId,
    artifactId: params.artifactId,
    grantedAt: new Date(params.nowMs).toISOString(),
    expiresAt: new Date(params.nowMs + params.ttlMs).toISOString(),
    scopes: params.scopes,
    statementVersion: CONSENT_STATEMENT_VERSION,
    statementText: CONSENT_STATEMENT_TEXT,
    method: "clickwrap",
    affirmative: true,
    conscious: true,
    voluntary: true,
    freeFromCoercion: true,
    submitterAssertsRights: params.submitterAssertsRights,
  };
}
