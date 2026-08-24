/**
 * What the audio modality is allowed to offer, and the contractual reason it is not more.
 *
 * `market-check-reproduction.md` establishes the constraint from the vendors' own terms
 * rather than from a technical limit. ElevenLabs Instant Voice Cloning requires a consent
 * attestation and a minute of audio; Professional cloning requires identity verification;
 * and the terms state plainly that even with a person's consent you may not clone somebody
 * else's voice. The reproduction side of this product is therefore permanently closed to
 * voice cloning. It is a terms problem and no amount of engineering makes it go away.
 *
 * That has a direct and load-bearing consequence for DETECTION, which is why it is written
 * down inside this package rather than left in a research file:
 *
 *   The honest audio offering is PROVENANCE plus a measured cost of producing a synthetic
 *   read of the same text. It is never "this is a copy of a named person's voice."
 *
 * The second half is not merely unsupported, it is the single most defamatory sentence this
 * whole product could form, it is the one with a criminal statute attached in at least one
 * state (`publicity-defamation-risk.md` on the Tennessee ELVIS Act's tool-liability prong),
 * and we could not substantiate it even if we wanted to, because we cannot legally build the
 * comparison that would be needed to test it.
 *
 * `@slop/provenance/claims.ts` enforces the negative half mechanically: "cloned voice",
 * "voice clone of", "clone of ", "is the voice of", "sounds like " and "impersonat" are all
 * unsayable by construction, and a test in this package proves it on this modality's strings.
 *
 * NOTE ON THE COST FIGURE. The reproduction cost is deliberately NOT written down here. Under
 * *In re Workado* a stated performance figure is a substantiation-bearing claim held to the
 * moment it is made, so the number has to come from a run of the reproduction pipeline
 * against the actual text, at the actual prices of the day, and be shown with its receipt.
 * A constant in a source file would be stale within a month and unsubstantiated on day one.
 */

export const AUDIO_SCOPE_STATEMENT =
  "This detector reads what an audio file declares about itself: the container's writer field, the tags, an XMP " +
  "packet, and a Content Credential if one survived. It does not analyse the sound. It has no way to identify a " +
  "speaker, it will not compare a recording against a person, and it is built so that it cannot form that " +
  "sentence at all. Where a comparison is wanted, the reproduction pipeline can measure what it costs us to " +
  "produce a synthetic read of the same words, and report that measurement with its receipt.";

export const AUDIO_OUT_OF_SCOPE: readonly string[] = [
  "Comparing a recording against a named person. Contractually closed on the reproduction side and legally the " +
    "most dangerous claim in the product.",
  "Vocoder or codec artifact statistics. The same collapse-under-re-encoding argument that rules out pixel " +
    "forensics applies at least as strongly to perceptually coded audio.",
  "Speaker embeddings or similarity scores. A similarity number about a person is an accusation with a decimal " +
    "point on it.",
  "Transcription, and anything downstream of it. Not this package's job and a separate consent question.",
];
