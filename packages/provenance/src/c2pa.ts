/**
 * C2PA / Content Credentials.
 *
 * WHAT THIS MODULE WILL AND WILL NOT CLAIM
 *
 * A C2PA manifest is a COSE-signed CBOR structure whose trust rests entirely on verifying a
 * certificate chain against a trust list. This package does not ship a verifier and does not
 * pretend to be one. The container layer LOCATES the manifest box (JUMBF in APP11, `caBX` in
 * PNG, a `c2pa` box in ISO-BMFF) and this module records that it is there. A caller that has
 * run a real verifier hands the verified result in, and only then may a rule speak about
 * what the manifest says.
 *
 * The distinction is the whole point. "A manifest is present" and "a manifest validates" are
 * different facts, and a product that conflates them is exactly one supply-chain trick away
 * from citing an attacker's own assertion as provenance.
 *
 * THE RULE THAT MATTERS MOST IS THE NEGATIVE ONE
 *
 * `absenceIsNotEvidence` exists because "no Content Credential, therefore synthetic" is the
 * single most common fallacy in this category, and it is wrong for a boring reason: almost
 * nothing has one. Cameras that write C2PA are a handful of recent bodies; every screenshot,
 * every social re-upload, every messaging app strips it. `image-detection-reality.md` records
 * that a screenshot destroys the provenance read at the same moment it destroys the other
 * three. An absent manifest is therefore consistent with every origin story there is, which
 * is the definition of no evidence.
 */

/** How much we actually know about a manifest, kept separate from what it says. */
export type C2paState =
  /** No manifest box was found in the container. */
  | "absent"
  /**
   * A manifest box is present and this build did not verify its signature. Its CONTENTS may
   * not be cited as provenance: an unverified assertion is a string somebody put in a file.
   */
  | "present_unverified"
  /** A caller's verifier validated the signature and the hard bindings. Citable. */
  | "verified"
  /** A caller's verifier ran and rejected it. Also not evidence of generation. See below. */
  | "invalid"
  /** A box is present and could not be read at all. A fact about the bytes, not the origin. */
  | "unparseable";

/**
 * A digital source type, per the IPTC vocabulary C2PA points at.
 *
 * These are the only values in this package that come close to a declaration of machine
 * origin, and they are declarations: the producer wrote them, in a defined field, to say so.
 * That is a completely different object from a classifier's opinion.
 */
export type DigitalSourceType =
  | "trainedAlgorithmicMedia"
  | "compositeWithTrainedAlgorithmicMedia"
  | "algorithmicMedia"
  | "digitalCapture"
  | "digitalArt"
  | "composite"
  | "minorHumanEdits"
  | "unknown";

export const DIGITAL_SOURCE_TYPES: readonly DigitalSourceType[] = [
  "trainedAlgorithmicMedia",
  "compositeWithTrainedAlgorithmicMedia",
  "algorithmicMedia",
  "digitalCapture",
  "digitalArt",
  "composite",
  "minorHumanEdits",
  "unknown",
];

/** Normalise the IPTC URI form to the bare term. Unknown values stay unknown, not guessed. */
export function digitalSourceTypeOf(value: string | undefined): DigitalSourceType {
  if (!value) return "unknown";
  const tail = value.split("/").pop()?.trim() ?? "";
  return (DIGITAL_SOURCE_TYPES.find((t) => t.toLowerCase() === tail.toLowerCase()) ?? "unknown") as DigitalSourceType;
}

/** One action from a `c2pa.actions` assertion. */
export interface C2paAction {
  readonly action: string;
  readonly digitalSourceType?: string;
  readonly softwareAgent?: string;
}

/**
 * The subset of a manifest this package reads.
 *
 * Deliberately small. Every field here is one a rule cites; a field nothing cites would be
 * an unexercised path in a package whose claim is that it only reports what it read.
 */
export interface C2paManifest {
  /** `claim_generator`, e.g. "Adobe Firefly 1.0" or "Leica M11-P". */
  readonly claimGenerator: string;
  readonly actions: readonly C2paAction[];
  /** `c2pa.training-mining` and similar assertion labels present in the manifest. */
  readonly assertionLabels: readonly string[];
  /** Issuer common name from the signing certificate, when a verifier reported one. */
  readonly signatureIssuer?: string;
  /** True when the manifest declares an ingredient chain (this asset was built from others). */
  readonly hasIngredients: boolean;
}

export interface C2paRecord {
  readonly state: C2paState;
  /** Where the box was found. Present whenever `state !== "absent"`. */
  readonly locator: string | null;
  readonly byteLength: number;
  /** Only populated for `verified`. Never read from an unverified manifest. */
  readonly manifest: C2paManifest | null;
  /** Verifier messages, verbatim, when a verifier ran. */
  readonly validationNotes: readonly string[];
}

export const NO_MANIFEST: C2paRecord = {
  state: "absent",
  locator: null,
  byteLength: 0,
  manifest: null,
  validationNotes: [],
};

/**
 * The single most important sentence in these three packages, expressed as a function so it
 * can be tested rather than believed.
 *
 * Given any C2PA state, this returns whether that state may contribute evidence that the
 * artifact was machine-produced. Only `verified` can, and only then via what the manifest
 * actually asserts. `absent`, `unparseable` and `invalid` all return false, and `invalid` is
 * the subtle one: a broken manifest means the chain of custody is broken, which is a reason
 * to trust the manifest LESS, not a reason to trust an accusation more.
 */
export function mayContributeGenerationEvidence(state: C2paState): boolean {
  return state === "verified";
}

/**
 * The stated rebuttal, carried with the finding rather than kept in an FAQ. Callers print
 * this verbatim whenever they report anything about a manifest, including its absence.
 */
export const ABSENCE_IS_NOT_EVIDENCE =
  "No Content Credential was found. That is the ordinary case: most cameras do not write one, and a screenshot, " +
  "a re-upload or a messaging app strips one that was there. An absent manifest is consistent with every origin " +
  "story there is, so we draw nothing from it in either direction.";

export const BROKEN_MANIFEST_IS_NOT_EVIDENCE =
  "A Content Credential was present and did not validate. That breaks the chain of custody, so we decline to read " +
  "what it says. It is not a substitute finding: a manifest can fail to validate because it was re-encoded, " +
  "because a certificate expired, or because this build reads a different version of the specification.";

export function absenceIsNotEvidence(record: C2paRecord): string | null {
  if (record.state === "absent") return ABSENCE_IS_NOT_EVIDENCE;
  if (record.state === "invalid" || record.state === "unparseable") return BROKEN_MANIFEST_IS_NOT_EVIDENCE;
  return null;
}

/**
 * Build a record from what the container found, without a verifier.
 *
 * The result is always `present_unverified` or `absent`. This function cannot produce
 * `verified`, by construction, and that is the guardrail: there is no code path from "we saw
 * a box" to "the manifest says so".
 */
export function locatedManifest(locator: string | null, byteLength: number): C2paRecord {
  if (locator === null) return NO_MANIFEST;
  return {
    state: "present_unverified",
    locator,
    byteLength,
    manifest: null,
    validationNotes: [
      "A Content Credential box is present. This build locates it and does not verify its signature, so its " +
        "contents are not read as provenance. Verifying it needs a C2PA validator and a trust list.",
    ],
  };
}

/** Wrap the output of a real verifier. The only route to a citable manifest. */
export function verifiedManifest(
  locator: string,
  byteLength: number,
  manifest: C2paManifest,
  notes: readonly string[] = [],
): C2paRecord {
  return { state: "verified", locator, byteLength, manifest, validationNotes: notes };
}

export function rejectedManifest(locator: string, byteLength: number, notes: readonly string[]): C2paRecord {
  return { state: "invalid", locator, byteLength, manifest: null, validationNotes: notes };
}

/**
 * Does a verified manifest declare that a model made this?
 *
 * Two routes, both explicit in the specification: a `c2pa.created` action whose
 * `digitalSourceType` is a trained-algorithmic term, or the same term on any other action.
 * Nothing is inferred from the claim generator's NAME, because a product name is marketing
 * and "Photoshop" has said nothing about how a pixel came to exist since 1990.
 */
export function declaredTrainedAlgorithmic(manifest: C2paManifest): readonly C2paAction[] {
  return manifest.actions.filter((a) => {
    const t = digitalSourceTypeOf(a.digitalSourceType);
    return t === "trainedAlgorithmicMedia" || t === "compositeWithTrainedAlgorithmicMedia";
  });
}

/** Does a verified manifest declare an ordinary camera capture? Counter-evidence, when so. */
export function declaredCapture(manifest: C2paManifest): readonly C2paAction[] {
  return manifest.actions.filter((a) => digitalSourceTypeOf(a.digitalSourceType) === "digitalCapture");
}
