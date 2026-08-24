/**
 * The only sentences a credential is allowed to contain.
 *
 * `@slop/core` bans a verdict vocabulary and `@slop/reproduce` extends it with an attribution rule.
 * This is the third mirror, and the rule it adds is the one this package specifically needs: a
 * credential is READ BY SOMEBODY WHO WANTS IT TO SAY MORE THAN IT SAYS. The holder wants a badge,
 * the platform wants a boolean, and both will quote whichever sentence comes closest. So the
 * sentence has to be unable to come close.
 *
 * TWO RULES, both enforced at construction and both mutation-tested.
 *
 *  1. A BANNED-PHRASE LIST, inherited wholesale from core rather than retyped, plus the vocabulary
 *     of certification. "Verified human" is named explicitly in `human-verification-licensing.md`
 *     section 7 as the phrase not to ship: it is unbounded, it invites the FTC and Lanham analysis,
 *     and it is not what the system proves.
 *
 *  2. A HUMANITY RULE. Any sentence containing a word for a person must also contain a limitation.
 *     This is the machine-checkable form of the memo's central caveat: process attestation proves a
 *     WORKFLOW, not a person, and somebody can run generated output through a "human" workflow. The
 *     related finding is worse and more specific - arXiv 2601.17280 achieved 99.8% evasion against
 *     keystroke-based authorship detection across 13,000 sessions, including a copy-type attack
 *     where a person transcribing model output produces a near-genuine timing trace. So the most
 *     this evidence can support is "a tool was operated", and any sentence that reaches for a
 *     person has to say what it cannot support in the same breath.
 */

import { FORBIDDEN_VERDICT_PHRASES } from "@slop/core";

/**
 * Phrases that are never emitted, whatever the surrounding grammar.
 *
 * Three groups: claims of humanity, claims of certainty, and the vocabulary of certification. The
 * last group is the one that would quietly turn us into a certification authority in fact while
 * being one in neither law nor capability.
 */
export const FORBIDDEN_ATTESTATION_PHRASES: readonly string[] = [
  ...FORBIDDEN_VERDICT_PHRASES,
  // ...claims of humanity
  "verified human",
  "human verified",
  "human-verified",
  "proof of humanity",
  "proof of personhood",
  "human-made",
  "human made",
  "made by a human",
  "made by hand",
  "not ai",
  "no ai",
  "ai-free",
  "ai free",
  "identity verified",
  "verified creator",
  "verified author",
  "verified artist",
  // ...claims of certainty
  "proves",
  "proof that",
  "guarantee",
  "guaranteed",
  "certifies",
  "certified",
  "confirms that",
  "authentic",
  "genuine",
  "tamper-proof",
  "tamperproof",
  "unforgeable",
  // ...claims about somebody's process we did not see
  "from scratch",
  "original work",
];

/** Words that put a PERSON in the sentence. */
export const HUMANITY_NOUNS = [
  "human",
  // "who" on its own, because the interesting overclaims are verbs rather than nouns: "shows who
  // operated it" names a person without using a word for one. Caught by the test suite, which is
  // the only reason this entry is here rather than a tidier list of nouns.
  "who",
  "person",
  "people",
  "author",
  "artist",
  "creator",
  "maker",
  "identity",
  "who made",
  "who wrote",
  "who drew",
];

/**
 * Markers that make a sentence a limitation rather than a claim.
 *
 * A sentence may name a person only while saying what is not known about them. "Does not", "no",
 * "cannot", "nothing" - the vocabulary of a caveat.
 */
export const LIMITATION_MARKERS = [
  "not ",
  "no ",
  "never",
  "cannot",
  "nothing",
  "without",
  "does not",
  "do not",
  "makes no",
  "make no",
  "is silent",
  "says nothing",
];

export interface AttestationViolation {
  readonly sentence: string;
  readonly kind: "forbidden_phrase" | "unlimited_humanity_claim";
  readonly detail: string;
}

export class ForbiddenAttestationError extends Error {
  constructor(readonly violations: readonly AttestationViolation[]) {
    super(
      `a credential may only state what is provable. ${violations.length} violation(s):\n` +
        violations.map((v) => `  - [${v.kind}] ${v.detail}\n    in: ${v.sentence}`).join("\n"),
    );
    this.name = "ForbiddenAttestationError";
  }
}

export function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * The one carve-out, and it is a collision rather than an exception.
 *
 * Core's list bans "the author", correctly: in a sentence about somebody's work it names a person.
 * But "the authority" and "the authorities" CONTAIN it as a substring, and this package cannot
 * describe an RFC 3161 timestamp authority without saying the word. So the noun is neutralised
 * before phrase matching, and only that noun.
 *
 * Exported so a test can pin how narrow it is: "the authorship" and "the author" itself must still
 * be caught. A substring guard with a substring exception is exactly where a real claim would hide.
 */
export function neutralizeAuthorityNoun(sentence: string): string {
  return sentence.replace(/\bauthorit(?:y|ies)\b/gi, "TSA");
}

export function findAttestationViolations(text: string): AttestationViolation[] {
  const out: AttestationViolation[] = [];
  for (const sentence of sentencesOf(text)) {
    const lower = neutralizeAuthorityNoun(sentence.toLowerCase());
    for (const phrase of FORBIDDEN_ATTESTATION_PHRASES) {
      if (lower.includes(phrase)) {
        out.push({
          sentence,
          kind: "forbidden_phrase",
          detail: `contains the forbidden phrase ${JSON.stringify(phrase)}`,
        });
      }
    }
    const noun = HUMANITY_NOUNS.find((n) => new RegExp(`\\b${n}\\b`).test(lower));
    if (noun !== undefined && !LIMITATION_MARKERS.some((m) => lower.includes(m))) {
      out.push({
        sentence,
        kind: "unlimited_humanity_claim",
        detail:
          `names a person (${JSON.stringify(noun)}) without a limitation in the same sentence. A recorded ` +
          `process supports "a tool was operated" and nothing about who operated it`,
      });
    }
  }
  return out;
}

/** Throws rather than returns. Every statement builder in the package calls this on its own output. */
export function assertAttestable(text: string): string {
  const violations = findAttestationViolations(text);
  if (violations.length > 0) throw new ForbiddenAttestationError(violations);
  return text;
}
