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
  | "digitalCapture"
  | "computationalCapture"
  | "negativeFilm"
  | "positiveFilm"
  | "print"
  | "minorHumanEdits"
  | "humanEdits"
  | "algorithmicallyEnhanced"
  | "softwareImage"
  | "digitalArt"
  | "digitalCreation"
  | "dataDrivenMedia"
  | "trainedAlgorithmicMedia"
  | "algorithmicMedia"
  | "screenCapture"
  | "virtualRecording"
  | "composite"
  | "compositeCapture"
  | "compositeSynthetic"
  | "compositeWithTrainedAlgorithmicMedia"
  /** Sentinel. Not an IPTC term: it is what we say when the file said something we cannot name. */
  | "unknown";

export const DIGITAL_SOURCE_TYPES: readonly DigitalSourceType[] = [
  "digitalCapture",
  "computationalCapture",
  "negativeFilm",
  "positiveFilm",
  "print",
  "minorHumanEdits",
  "humanEdits",
  "algorithmicallyEnhanced",
  "softwareImage",
  "digitalArt",
  "digitalCreation",
  "dataDrivenMedia",
  "trainedAlgorithmicMedia",
  "algorithmicMedia",
  "screenCapture",
  "virtualRecording",
  "composite",
  "compositeCapture",
  "compositeSynthetic",
  "compositeWithTrainedAlgorithmicMedia",
  "unknown",
];

/**
 * What a term argues ABOUT AN ARTIFACT, which is the only reason this package enumerates the
 * vocabulary at all.
 *
 * Written as a total Record so the compiler refuses a term added to the union without a
 * classification. A term nobody classified would decode successfully and then be handled by
 * no branch, which is `unknown` again with extra steps.
 *
 * Nothing here automatically feeds a scoring rule. Each rule names the kinds it reads, in its
 * own `detect`, so widening this vocabulary can never quietly widen what a signal rule fires
 * on. That is deliberate: the enumeration is a reading of the file, and a rule is a judgement
 * about the reading, and those two must not be the same list.
 */
export type DigitalSourceKind =
  /** A device recorded the world. The strongest thing a file can say in its own defence. */
  | "capture"
  /** An analogue original was digitised: film, a print. A capture at one remove. */
  | "analogue-original"
  /** A person edited something that already existed. */
  | "human-edit"
  /** Machine-produced, without a trained model in the chain (procedural, data-driven). */
  | "algorithmic"
  /** Machine-produced BY a trained model. The declaration this product is built to read. */
  | "trained-algorithmic"
  /** Assembled from several sources, whose own origins the term does not settle. */
  | "composite"
  /** A recording of already-rendered pixels. Says nothing about what was rendered. */
  | "screen-capture"
  /** Recorded inside a synthetic environment: a game, a simulation, a virtual set. */
  | "virtual"
  /** The sentinel. */
  | "unknown";

export const DIGITAL_SOURCE_KINDS: Readonly<Record<DigitalSourceType, DigitalSourceKind>> = {
  digitalCapture: "capture",
  // The repair L-17 names. `computationalCapture` is a photograph a modern phone took: many
  // frames, fused computationally, and still a recording of the world. It belongs with
  // `digitalCapture` and it used to decode to `unknown`, which killed the -2.2 counter and so
  // RAISED the score of an honest pipeline that declared itself.
  computationalCapture: "capture",
  negativeFilm: "analogue-original",
  positiveFilm: "analogue-original",
  print: "analogue-original",
  minorHumanEdits: "human-edit",
  humanEdits: "human-edit",
  algorithmicallyEnhanced: "human-edit",
  softwareImage: "algorithmic",
  digitalArt: "human-edit",
  digitalCreation: "algorithmic",
  dataDrivenMedia: "algorithmic",
  trainedAlgorithmicMedia: "trained-algorithmic",
  algorithmicMedia: "algorithmic",
  screenCapture: "screen-capture",
  virtualRecording: "virtual",
  composite: "composite",
  compositeCapture: "composite",
  compositeSynthetic: "composite",
  compositeWithTrainedAlgorithmicMedia: "trained-algorithmic",
  unknown: "unknown",
};

export const kindOfDigitalSourceType = (t: DigitalSourceType): DigitalSourceKind => DIGITAL_SOURCE_KINDS[t];

/**
 * The terms that mean "a device recorded the world", and therefore the terms the capture
 * counter reads.
 *
 * `analogue-original` is deliberately NOT in here, and the omission is a decision rather than
 * an oversight. A film scan is excellent counter-evidence on its face, but the counter rule's
 * published explanation is about a signed chain of custody back to a CAPTURE DEVICE, and
 * widening the set without rewriting the rule would make the rule's own published rationale
 * false. Widening it is a corpus-steward question with a false-positive-hunter second read,
 * not a parser question, so it is recorded here and left alone.
 */
export const CAPTURE_SOURCE_TYPES: readonly DigitalSourceType[] = DIGITAL_SOURCE_TYPES.filter(
  (t) => DIGITAL_SOURCE_KINDS[t] === "capture",
);

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

/**
 * Does a verified manifest declare an ordinary camera capture? Counter-evidence, when so.
 *
 * Reads the capture KIND rather than the single term `digitalCapture`, which is the L-17
 * repair: `computationalCapture` decoded to `unknown` and could not reach this counter at
 * all, so a phone declaring honestly how it fused its frames lost -2.2 of exoneration and
 * scored HIGHER for it.
 */
export function declaredCapture(manifest: C2paManifest): readonly C2paAction[] {
  return manifest.actions.filter((a) => kindOfDigitalSourceType(digitalSourceTypeOf(a.digitalSourceType)) === "capture");
}
