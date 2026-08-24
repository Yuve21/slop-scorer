/**
 * What the audio modality is allowed to offer, and the two different reasons it is not more.
 *
 * There are TWO constraints here and conflating them is what the first version of this file
 * did wrong. One is contractual and permanent. The other is epistemic and has a boundary
 * rather than a wall, and the boundary is where the listening half of this package lives.
 *
 * ---------------------------------------------------------------------------------------
 * CONSTRAINT ONE: VOICE CLONING IS CONTRACTUALLY CLOSED, PERMANENTLY.
 * ---------------------------------------------------------------------------------------
 *
 * `market-check-reproduction.md` establishes it from the vendors' own terms rather than from
 * a technical limit. ElevenLabs Instant Voice Cloning requires a consent attestation and a
 * minute of audio; Professional cloning requires identity verification; and the terms state
 * plainly that even with a person's consent you may not clone somebody else's voice. The
 * reproduction side of this product is therefore permanently closed to voice cloning. It is a
 * terms problem and no amount of engineering makes it go away.
 *
 * That has a direct and load-bearing consequence for DETECTION:
 *
 *   We never say a recording is a copy of a named person's voice.
 *
 * That sentence is not merely unsupported. It is the single most defamatory sentence this
 * whole product could form, it is the one with a criminal statute attached in at least one
 * state (`publicity-defamation-risk.md` on the Tennessee ELVIS Act's tool-liability prong),
 * and we could not substantiate it even if we wanted to, because we cannot legally build the
 * comparison that would be needed to test it.
 *
 * `@slop/provenance/claims.ts` enforces it mechanically: "cloned voice", "voice clone of",
 * "clone of ", "is the voice of", "sounds like " and "impersonat" are unsayable by
 * construction, and a test in this package runs the guard over EVERY string this package can
 * emit — including every sentence the listening rules added — and over attempts to write the
 * sentence anyway, which it must reject.
 *
 * ---------------------------------------------------------------------------------------
 * CONSTRAINT TWO: WE MEASURE THE FILE. WE DO NOT CHARACTERISE THE SPEAKER.
 * ---------------------------------------------------------------------------------------
 *
 * The first version of this file said this detector would never analyse the sound at all, and
 * gave the reason: perceptual coding discards the fine structure a signal statistic reads, and
 * almost all audio that reaches anybody has been coded at least once. That reason is correct
 * and it is still enforced — the re-encoding gate stops every rule from running on a
 * transcoded file, and the one rule that reads the spectrum refuses to fire unless the samples
 * are stored losslessly, because a high-frequency ceiling in a lossy file is the codec's own
 * lowpass and nothing else.
 *
 * What was wrong was treating "analysing the sound" as a single thing. Two examples:
 *
 *   "The quietest sustained passage in this file measures -84 dBFS, across the six pauses
 *   listed below, and here is the one command that reproduces the figure."
 *
 *   "This voice is 91% similar to the reference."
 *
 * Both are numbers derived from samples. They are not the same kind of claim. The first has
 * THE FILE as its subject, it is re-derivable by anybody who disagrees with it, and it stays
 * true whatever anyone concludes from it. The second has A PERSON as its subject, cannot be
 * re-derived without our model, and is an accusation with a decimal point on it. Refusing to
 * make the first because the second is unacceptable was refusing to listen at all.
 *
 * So the line, and it is drawn in code rather than in prose: measurements whose subject is
 * the FILE are made, fenced as probabilistic in what they are taken to MEAN, capped below
 * every other family, and printed with the command that produced them. Statistics whose
 * subject is a PERSON are not made at all.
 *
 * NOTE ON THE COST FIGURE, unchanged. The reproduction cost is deliberately not written down
 * here. Under *In re Workado* a stated performance figure is a substantiation-bearing claim
 * held to the moment it is made, so the number has to come from a run of the reproduction
 * pipeline against the actual text, at the actual prices of the day, and be shown with its
 * receipt. A constant in a source file would be stale within a month and unsubstantiated on
 * day one.
 */

export const AUDIO_SCOPE_STATEMENT =
  "This detector reads what an audio file declares about itself: the container's writer field, the tags, an XMP " +
  "packet, and a Content Credential if one survived. Where a local decoder is installed and switched on, it also " +
  "measures the file: how quiet the pauses are, how much their lengths vary, where the energy stops, whether the " +
  "header agrees with what decoded. Those measurements are reported as probabilistic, capped below every " +
  "declaration we read, and printed with the command that produced each number so any of them can be repeated. " +
  "It does not analyse the sound for anything about the speaker. It has no way to identify a speaker, it will not " +
  "compare a recording against a person, and it is built so that it cannot form that sentence at all. Where a " +
  "comparison is wanted, the reproduction pipeline can measure what it costs us to produce a synthetic read of " +
  "the same words, and report that measurement with its receipt.";

export const AUDIO_OUT_OF_SCOPE: readonly string[] = [
  "Comparing a recording against a named person. Contractually closed on the reproduction side and legally the " +
    "most dangerous claim in the product.",
  "Speaker embeddings and similarity scores. A similarity number about a person is an accusation with a decimal " +
    "point on it, and no measurement in this package has a person as its subject.",
  "Per-generator fingerprints: vocoder artifacts, spectrogram features, cepstral coefficients, formant statistics, " +
    "or any classifier trained to put a service's name to a file. These are the reads that collapse under a " +
    "re-encode, and almost all audio reaches anybody re-encoded at least once.",
  "Any measurement at all on a file the re-encoding gate closed on. The gate runs before every rule, including " +
    "the ones that listen, because a noise floor measured after a platform transcode is a measurement of the " +
    "platform's encoder.",
  "A spectral ceiling in a perceptually coded file. The codec applies its own lowpass as part of doing its job, so " +
    "that ceiling is a reading of the encoder's settings and carries nothing about the source.",
  "Transcription by default. No transcriber ships in this build: a local model has to be installed, and a vendor " +
    "one would mean sending somebody's recording to a third party, which is a decision for whoever submitted the " +
    "file. See transcribe.ts for the terms line on vendor output.",
];

/**
 * The sentence a UI prints next to a measured line, and the reason it exists as a constant.
 *
 * A caveat retyped at each call site softens in exactly one of them, and the softened copy is
 * always the one attached to the finding somebody is about to act on.
 */
export const AUDIO_MEASUREMENT_CAVEAT =
  "A measurement of the samples is the weakest evidence in this product and is capped to stay that way. It cannot " +
  "carry a verdict on its own, it is silent on any file the re-encoding gate closed on, and where it disagrees " +
  "with a declaration in the file the declaration wins. It says nothing whatever about who is speaking.";
