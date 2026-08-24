/**
 * The only sentences the media packages are allowed to emit.
 *
 * `@slop/core` owns `FORBIDDEN_VERDICT_PHRASES` for the one verdict sentence. This is the
 * mirror for the media modalities, and the media modalities need a stronger rule than the
 * text ones for a specific, documented reason: `image-detection-reality.md` records four
 * cases where a human being was publicly accused of being a machine — Ben Moran banned from
 * r/Art over a hundred-hour illustration after offering his process files, Suzi Dougherty
 * disqualified on judges' "gut instinct", a real Nikon photograph placing third in an AI
 * category judged by the NYT and Getty, and a real war photograph called synthetic within
 * hours by a shipping tool that Hany Farid described as "a second level of disinformation".
 *
 * In none of those cases was the accusation retractable. Moran offered the PSD and was told
 * "I don't believe you". So the constraint is not tone: it is that the product must be
 * incapable of forming the sentence.
 *
 * TWO RULES, both enforced at construction and both mutation-tested.
 *
 *  1. A BANNED-PHRASE LIST, inherited from core and extended. Inheriting rather than copying
 *     is deliberate: a phrase added to core must not become sayable here.
 *  2. AN ATTRIBUTION RULE. Any sentence containing an origin word must attribute that origin
 *     to a DECLARATION IN THE FILE or to an action of OURS, or be a negation. "The manifest
 *     asserts a trained-algorithmic source" passes, because the manifest is the speaker.
 *     "This image is synthetic" does not, and no hedging gets it through, because the fault
 *     is the subject rather than the confidence.
 */

import { FORBIDDEN_VERDICT_PHRASES } from "@slop/core";

/**
 * Phrases never emitted, whatever the grammar around them.
 *
 * Core's list plus three groups: claims the artifact is machine-made, claims it is
 * human-made (the inverse accusation, equally unsubstantiable, and the one a "verified
 * human" product is most tempted by), and the vocabulary of certainty.
 */
export const FORBIDDEN_MEDIA_PHRASES: readonly string[] = [
  ...FORBIDDEN_VERDICT_PHRASES,
  // ...it is machine-made
  "this is ai",
  "is synthetic",
  "was synthetic",
  "is a deepfake",
  "deepfaked",
  "is fabricated",
  "was fabricated",
  "likely ai",
  "probably ai",
  "ai slop",
  "used a generator",
  "used a model to",
  "passed off",
  "undisclosed use",
  // ...it is a clone of a named person. The audio modality's permanent tripwire.
  "cloned voice",
  "voice clone of",
  "clone of ",
  "impersonat",
  "sounds like ",
  "is the voice of",
  // ...it is human-made. Never a clean bill, never a green check.
  "is human",
  "was human",
  "human-made",
  "human made",
  "made by a human",
  "made by hand",
  "verified human",
  "authentic",
  "genuine",
  "real photo",
  "unaltered",
  // ...the vocabulary of certainty
  "proves",
  "proof that",
  "confirms that",
  "definitely",
  "certainly",
  "beyond doubt",
  "conclusive",
];

/** Words that assert something about how an artifact came to exist. */
const ORIGIN_WORDS = [
  "synthetic",
  "generated",
  "generative",
  "trained-algorithmic",
  "trainedalgorithmicmedia",
  "machine-made",
  "model-made",
  "produced",
  "created",
  "made",
  "written",
  "recorded",
  "captured",
];

/**
 * Markers that make an origin word attributable rather than asserted.
 *
 * Two families: the FILE said it (a manifest, a field, a tag, a chunk, a declaration), or WE
 * did it (first person). Word-bounded, because a substring test would read "focus" as "us"
 * and quietly accept an unattributed claim — the silent-pattern failure this repository's
 * meta suite exists to catch.
 */
const ATTRIBUTION_MARKERS: readonly RegExp[] = [
  /\bwe\b/i,
  /\bwe'/i,
  /\bour\b/i,
  /\bus\b/i,
  /\bdeclar(?:es|ed|ation|ations)\b/i,
  /\bassert(?:s|ed|ion|ions)\b/i,
  /\bstat(?:es|ed|ement)\b/i,
  /\bsays\b/i,
  /\bnames\b/i,
  /\bnamed\b/i,
  /\bmanifest\b/i,
  /\bmetadata\b/i,
  /\bfield\b/i,
  /\bchunk\b/i,
  /\btag\b/i,
  /\batom\b/i,
  /\bheader\b/i,
  /\bmarker\b/i,
  /\bthis rule\b/i,
  /\bthe tool\b/i,
  /\bthe encoder\b/i,
  /\bthe producer\b/i,
  /\bthe file\b/i,
  /\bthe container\b/i,
  /\bwriter\b/i,
  /\bwrites\b/i,
  /\bwrote\b/i,
  /\bwritten into\b/i,
];

/** Markers that make a sentence a denial rather than an assertion. */
const NEGATIONS = ["not ", "no ", "never", "cannot", "nothing", "without ", "neither ", "does not", "did not"];

export interface MediaClaimViolation {
  readonly sentence: string;
  readonly kind: "forbidden_phrase" | "unattributed_origin";
  readonly detail: string;
}

export class ForbiddenMediaClaimError extends Error {
  constructor(readonly violations: readonly MediaClaimViolation[]) {
    super(
      `The media detectors may only say what the FILE declared or what WE did. ${violations.length} violation(s):\n` +
        violations.map((v) => `  - [${v.kind}] ${v.detail}\n    in: ${v.sentence}`).join("\n"),
    );
    this.name = "ForbiddenMediaClaimError";
  }
}

/** Split on sentence terminators AND newlines, so a label or a list item is checked too. */
export function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Match one banned phrase against a sentence.
 *
 * A bare single word is matched at WORD BOUNDARIES; anything with a space, a hyphen or a
 * trailing space is matched as a substring the way it was written.
 *
 * This distinction is load-bearing and it was found the hard way. Core's list contains
 * `"lied"`, which as a substring also matches "applied", "supplied" and "implied" — three
 * words that appear naturally in an honest sentence about watermarks. A guard that fires on
 * those gets edited around, and a guard people edit around stops guarding. The rule stays
 * strict where strictness is meaningful and stops being superstitious where it is not.
 *
 * `stemmed` phrases (those the list writes as a prefix, like "plagiar" and "impersonat") are
 * deliberately matched as a prefix at a word boundary rather than anywhere in a word.
 */
export function phraseHit(lowerSentence: string, phrase: string): boolean {
  if (!/^[a-z-]+$/.test(phrase)) return lowerSentence.includes(phrase);
  return new RegExp(String.raw`\b${phrase}`, "i").test(lowerSentence);
}

export function mediaClaimViolations(text: string): readonly MediaClaimViolation[] {
  const violations: MediaClaimViolation[] = [];
  for (const sentence of sentencesOf(text)) {
    const lower = sentence.toLowerCase();
    for (const phrase of FORBIDDEN_MEDIA_PHRASES) {
      if (phraseHit(lower, phrase)) {
        violations.push({
          sentence,
          kind: "forbidden_phrase",
          detail: `contains the banned phrase "${phrase.trim()}"`,
        });
      }
    }
    const origin = ORIGIN_WORDS.find((w) => new RegExp(`\\b${w}`, "i").test(lower));
    if (!origin) continue;
    if (ATTRIBUTION_MARKERS.some((re) => re.test(lower))) continue;
    if (NEGATIONS.some((n) => lower.includes(n))) continue;
    violations.push({
      sentence,
      kind: "unattributed_origin",
      detail: `uses the origin word "${origin}" without attributing it to a declaration in the file or to an action of ours`,
    });
  }
  return violations;
}

/** Throwing form. Every reader-facing string in these packages is constructed through it. */
export function assertMediaSafe(text: string): string {
  const violations = mediaClaimViolations(text);
  if (violations.length > 0) throw new ForbiddenMediaClaimError(violations);
  return text;
}
