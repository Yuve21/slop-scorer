/**
 * THE TRANSCRIPTION PATH, and the terms line drawn through the middle of it.
 *
 * Feeding what was SAID to the text rules is obviously attractive: `copy.slop-lexicon` and
 * `copy.em-dash-density` already exist, they are deterministic, and a script read aloud
 * carries the same tells as a script that was published. This module makes that possible and
 * refuses to make it easy, because the two ways of getting a transcript are not equivalent
 * and one of them is closed to us for a reason that has nothing to do with engineering.
 *
 * THE LINE, stated once, precisely.
 *
 * ElevenLabs' terms bar using the Services "or Output" to "research and develop" a competing
 * product, and to "train, fine-tune, develop, TEST, or improve" any AI or machine-learning
 * model. `market-check-reproduction.md` records it; the audio README quotes it. That clause
 * has a sharp edge and the edge is the word "test":
 *
 *   ALLOWED, on our reading: transcribing ONE artifact a user submitted, to report back to
 *   that user what their own file said. That is using the service for its advertised purpose
 *   on the user's own content, and the output is delivered to the user rather than retained.
 *
 *   NOT ALLOWED: putting that output into our corpus, our calibration set, our baseline, our
 *   threshold-fitting, or any run whose purpose is to make this detector better. That is
 *   "develop, test, or improve", and a labelled example derived from their Output is exactly
 *   the thing the clause exists to stop. It does not matter that no gradient is involved:
 *   "develop" and "test" are not machine-learning terms of art in that sentence.
 *
 *   ALSO NOT ALLOWED, and easy to miss: using it to evaluate ourselves against them. Reading
 *   their transcript to see whether our detector agrees with it is "research and develop" a
 *   competing product on their Output, however casually it is done.
 *
 * The consequence in code is the `TranscriptSource` type below. A transcript carries WHERE IT
 * CAME FROM, and `mayEnterCorpus` is a function of that provenance rather than a flag a caller
 * sets. A vendor transcript can be shown to the user who asked for it and cannot enter a
 * fixture, a baseline or a threshold, and the corpus capture script asserts that.
 *
 * A local model has none of this problem. whisper.cpp and faster-whisper are MIT and MIT-ish
 * respectively over openly published weights, they run on the host with no key and no network,
 * and their output is ours. That is why the local path is the one this package recommends and
 * the vendor path is the one it fences.
 *
 * WHAT THIS MODULE DOES NOT DO. It does not ship a transcriber. Wiring one in is a decision
 * with a consent dimension — a recording of a person saying something is the most sensitive
 * artifact this product will ever be handed, and sending it anywhere is a choice a user makes
 * rather than a default we set. So the shipped state is `not_available`, and the type is here
 * so that whoever wires one in inherits the fence instead of inventing one.
 */

export type TranscriptSource =
  /**
   * A model that ran on this host, over openly licensed weights, with no network.
   * whisper.cpp (MIT) or faster-whisper (MIT) are the two intended cases.
   */
  | "local-model"
  /**
   * A vendor API or MCP tool. Usable for the submitting user's own artifact; NEVER usable as
   * training, tuning, threshold-fitting, calibration, baseline or comparison material.
   */
  | "vendor-api"
  /** A transcript or caption track the user supplied themselves. Ours to use freely. */
  | "user-supplied";

export interface Transcript {
  readonly source: TranscriptSource;
  /** Which model or service, with a version. An unattributed transcript is a rumour. */
  readonly engine: string;
  readonly text: string;
  /** Seconds covered, so a partial transcript cannot look like a whole one. */
  readonly coveredSeconds: number;
  readonly totalSeconds: number;
}

export type TranscriptState =
  | { readonly kind: "available"; readonly transcript: Transcript }
  | { readonly kind: "not_available"; readonly reason: string };

/**
 * The shipped state. No transcriber is wired in, and the sentence says why rather than
 * leaving a caller to wonder whether it ran and found nothing.
 */
export const NO_TRANSCRIPT: TranscriptState = {
  kind: "not_available",
  reason:
    "No transcript was produced. This build ships no transcriber: a local model would have to be installed and a " +
    "vendor one would mean sending somebody's recording to a third party, which is a decision for whoever is " +
    "submitting the file rather than a default. Nothing about the file follows from the absence, and no rule below " +
    "treated it as though the words had been checked and found ordinary.",
};

/**
 * MAY THIS TRANSCRIPT BE USED TO MAKE THE PRODUCT BETTER?
 *
 * The whole terms question, reduced to one function so it is enforced in one place instead of
 * remembered in several. It is deliberately NOT a caller-set flag: a flag is a thing somebody
 * sets wrong once, and the provenance is a fact about where the text came from.
 */
export function mayEnterCorpus(transcript: Transcript): boolean {
  return transcript.source !== "vendor-api";
}

export const VENDOR_TRANSCRIPT_REFUSAL =
  "This transcript came from a vendor API whose terms forbid using its output to develop, test or improve a model " +
  "or to research and develop a competing product. It may be shown to the person who submitted the recording and " +
  "it may not enter a corpus, a baseline, a calibration run or a threshold. Use a local model for anything that " +
  "changes how this detector behaves.";

/** Throwing form, for the capture and calibration paths. Refuses rather than warns. */
export function assertMayEnterCorpus(transcript: Transcript): Transcript {
  if (!mayEnterCorpus(transcript)) {
    throw new Error(`${VENDOR_TRANSCRIPT_REFUSAL} (engine: ${transcript.engine})`);
  }
  return transcript;
}

/**
 * What the text rules are handed, and the two caveats that ride with it.
 *
 * Marked probabilistic ON THE WAY IN rather than downstream. A text rule that is
 * deterministic over a document a user wrote is NOT deterministic over a transcript: the
 * transcriber chose the punctuation. `copy.em-dash-density` is the sharp example — an em dash
 * is not a sound, so every dash in a transcript was inserted by the transcriber, and a rule
 * that counts them is measuring the transcriber. That rule is therefore excluded by name here
 * rather than fenced with a caveat, because a caveat on a number nobody should have computed
 * is worse than not computing it.
 */
export const TRANSCRIPT_EXCLUDED_RULES: readonly string[] = ["copy.em-dash-density"];

export const TRANSCRIPT_CAVEAT =
  "These lines were found in a TRANSCRIPT rather than in text somebody typed, so two things are true of all of " +
  "them. The transcriber chose the spelling, the casing and every mark of punctuation, none of which was in the " +
  "audio. And a transcriber mishears: a phrase it invented is a phrase we would then quote. Punctuation-counting " +
  "rules are excluded outright for the first reason, and everything that remains is reported as probabilistic.";

/** The rules a transcript may legitimately be run against, given a candidate list. */
export function rulesForTranscript(candidateRuleIds: readonly string[]): readonly string[] {
  return candidateRuleIds.filter((id) => !TRANSCRIPT_EXCLUDED_RULES.includes(id));
}
