import type { CorpusCase } from "@slop/core";
import { synthMp3, synthWav } from "@slop/provenance";
import { audioVariant, ingestAudio, neutralAudio } from "../artifact.js";
import type { AudioArtifact } from "../artifact.js";
import {
  CLEAN_FLOOR_READING,
  DURATION_MISMATCH_READING,
  FULL_BAND_READING,
  ROOM_TONE_READING,
  UNIFORM_GAPS_READING,
  UPSAMPLED_READING,
  withReading,
} from "../stream.js";

/**
 * The audio corpus, with the same honesty note as the other two.
 *
 * These are constructed RIFF and MPEG audio files, not recordings. The label states what each
 * file DECLARES. Nothing computed here is a false-positive rate, and this detector ships
 * abstaining by default for that reason.
 *
 * The corpus is deliberately smaller than the image one, and the reason is worth stating: the
 * audio modality has fewer honest signals available to it than the other two. Voice cloning
 * is contractually closed on the reproduction side, per-generator signal forensics is ruled
 * out by the same argument that rules out pixel forensics, and Content Credentials in audio
 * are close to nonexistent in the wild. What is left is the writer field, the tags, and a
 * handful of measurements of the file; a small corpus is the accurate reflection of a small
 * surface rather than an incomplete job.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THERE IS NO CORPUS OF REAL RECORDINGS IN HERE, STATED PLAINLY.
 * ---------------------------------------------------------------------------------------
 *
 * The measurement rules were written against thresholds, and a threshold wants a labelled
 * corpus. There is not one here, and that is a refusal rather than an omission, for two
 * reasons that landed in opposite directions.
 *
 * NO PROVENANCED HUMAN SIDE. A negative here has to be audio somebody can vouch for: a
 * recording whose maker, microphone and room are known. Speech scraped off the internet
 * produces the exact corpus the research literature keeps embarrassing itself with, where
 * "human" means "we found it somewhere". Without a provenanced human side there is no
 * false-positive rate to compute, and a threshold fitted against synthetic examples alone
 * would be fitted to one half of the question.
 *
 * AND THE SYNTHETIC SIDE WE COULD REACH IS CONTRACTUALLY UNUSABLE. There is provenanced
 * synthetic speech within arm's reach of this repository: first-party text-to-speech output,
 * made under our own account, whose voice, model and settings are all recorded. It may not be
 * used. The vendor's terms bar using the Services or their Output to "train, fine-tune,
 * develop, TEST, or improve" any model, and to "research and develop" a competing product.
 * Fitting a detector's thresholds against their Output sits squarely inside that sentence,
 * and the vendor ships a classifier of its own, so the competing-product half is live too.
 * `../transcribe.ts` draws the same line for transcripts and enforces it in a function; this
 * file honours it by leaving the material out.
 *
 * SO: the measurement cases below are CONSTRUCTED READINGS, and they are honest about being
 * that. A reading is a row of numbers, so writing one by hand fakes nothing, and no case here
 * claims to be a recording of anybody. They exercise one threshold each, in both directions,
 * which is what a corpus is for. They are not evidence about the world and no rate computed
 * over them is a false-positive rate. Anyone holding audio they may lawfully use can build a
 * real local corpus with `scripts/capture-audio-corpus.mjs`, which writes outside this
 * repository on purpose.
 */
const CAPTURED_AT = "2026-08-23T00:00:00.000Z";
const STRUCTURAL =
  "Constructed for this suite from the container specification. The label states what the FILE DECLARES. It is not " +
  "a recording of anybody and no rate computed over this corpus is a false-positive rate.";

const make = (
  id: string,
  label: CorpusCase<AudioArtifact>["label"],
  source: string,
  artifact: AudioArtifact,
  provenance: string,
): CorpusCase<AudioArtifact> => ({ id, label, source, provenance: `${provenance} ${STRUCTURAL}`, artifact, capturedAt: CAPTURED_AT });

const base = neutralAudio();
const wav = (id: string, options: Parameters<typeof synthWav>[0]): AudioArtifact =>
  ingestAudio(synthWav(options), { locator: `corpus://${id}.wav`, mediaType: "audio/wav", capturedAt: CAPTURED_AT });
const mp3 = (id: string, options: Parameters<typeof synthMp3>[0]): AudioArtifact =>
  ingestAudio(synthMp3(options), { locator: `corpus://${id}.mp3`, mediaType: "audio/mpeg", capturedAt: CAPTURED_AT });

export const AUDIO_NEGATIVES: readonly CorpusCase<AudioArtifact>[] = [
  make(
    "studio-pcm-untagged",
    "human",
    "constructed WAVE, uncompressed, no tags",
    wav("studio-pcm-untagged", { sampleRate: 96_000, bitDepth: 24, channels: 2, seconds: 6 }),
    "Uncompressed PCM that declares nothing at all. The expected outcome is silence.",
  ),
  make(
    "daw-export",
    "human",
    "constructed WAVE whose ISFT names a digital audio workstation",
    wav("daw-export", { sampleRate: 48_000, bitDepth: 24, channels: 2, seconds: 4, info: { ISFT: "Pro Tools 2025.6" } }),
    "The writer field names an ordinary workstation, which says nothing about how the sound was made.",
  ),
  make(
    "hand-edit-history",
    "human",
    "constructed WAVE declaring several hand-driven edit steps",
    audioVariant(base, { kind: "hand-edit-history", steps: 4 }),
    "Declares four edit steps in hand-driven audio applications and no tool from the signature table.",
  ),
  make(
    "c2pa-verified-capture",
    "human",
    "constructed WAVE with a verifier's capture result attached",
    audioVariant(base, {
      kind: "content-credential",
      state: "verified",
      claimGenerator: "a field recorder",
      digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture",
    }),
    "Carries a Content Credential that a verifier validated, asserting a capture.",
  ),
  make(
    "c2pa-located-but-unverified",
    "human",
    "constructed WAVE with a manifest chunk this build did not verify",
    audioVariant(base, { kind: "content-credential", state: "unverified" }),
    "Carries a Content Credential chunk whose signature this build cannot check.",
  ),
];

export const AUDIO_POSITIVES: readonly CorpusCase<AudioArtifact>[] = [
  make(
    "isft-names-synthesis-service",
    "generated",
    "constructed WAVE whose ISFT names a synthesis service",
    audioVariant(base, { kind: "encoder", value: "ElevenLabs Turbo v2.5" }),
    "The container's own writer field names a service whose whole output is trained-algorithmic media.",
  ),
  make(
    "xmp-names-synthesis-service",
    "generated",
    "constructed WAVE whose XMP creator tool names a synthesis service",
    audioVariant(base, { kind: "declare-generative-tool" }),
    "An XMP creator-tool property names a service whose whole output is trained-algorithmic media.",
  ),
  make(
    "iptc-trained-algorithmic",
    "generated",
    "constructed WAVE with an unsigned IPTC source type",
    audioVariant(base, { kind: "declare-source-type", value: "trainedAlgorithmicMedia" }),
    "Declares a trained-algorithmic source type in unsigned metadata.",
  ),
  make(
    "c2pa-verified-trained-algorithmic",
    "generated",
    "constructed WAVE with a verifier's trained-algorithmic result attached",
    audioVariant(base, {
      kind: "content-credential",
      state: "verified",
      claimGenerator: "a speech synthesis service",
      digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
    }),
    "Carries a validated Content Credential whose action assertion declares a trained-algorithmic source.",
  ),
  make(
    "watermark-reported-by-external-detector",
    "generated",
    "constructed WAVE with a caller-supplied watermark result",
    audioVariant(base, { kind: "watermark", detector: "the scheme owner's detector, v2" }),
    "A named external detector reported a mark. This build ships no such detector; the result was supplied.",
  ),
];

export const AUDIO_LAUNDERED: readonly CorpusCase<AudioArtifact>[] = [
  make(
    "double-encoded-mp3",
    "unknown",
    "constructed MP3 whose tag and frame header name different encoders",
    mp3("double-encoded-mp3", { id3: { TSSE: "ElevenLabs" }, lame: "LAME3.100" }),
    "Two encoders are named in one file, so these are not the bytes the first one produced.",
  ),
];

/**
 * The measurement cases. Constructed readings, one per threshold, in both directions.
 *
 * The label describes what the READING is written to do and never a file that does not exist:
 * `generated` here means "these numbers are what the rule is written to fire on", which is a
 * statement about the corpus rather than about anybody's audio.
 */
export const AUDIO_MEASURED: readonly CorpusCase<AudioArtifact>[] = [
  make(
    "reading-clean-digital-silence",
    "generated",
    "constructed reading: a noise floor below any microphone's self-noise, with pauses to attribute it to",
    withReading(base, CLEAN_FLOOR_READING),
    "We wrote these numbers to sit on the far side of the clean-floor threshold. NOT A RECORDING.",
  ),
  make(
    "reading-uniform-pauses",
    "generated",
    "constructed reading: six pauses within a few per cent of each other",
    withReading(base, UNIFORM_GAPS_READING),
    "We wrote these numbers to sit on the far side of the pause-uniformity threshold. NOT A RECORDING.",
  ),
  make(
    "reading-upsampled-lossless",
    "generated",
    "constructed reading: uncompressed at 48 kHz carrying the bandwidth of something much narrower",
    withReading(base, UPSAMPLED_READING),
    "We wrote these numbers to sit on the far side of the spectral-cliff threshold. NOT A RECORDING.",
  ),
  make(
    "reading-header-disagrees-with-samples",
    "unknown",
    "constructed reading: a declared duration the decoder did not reproduce",
    withReading(base, DURATION_MISMATCH_READING),
    "We wrote these numbers to sit on the far side of the duration-mismatch threshold. NOT A RECORDING.",
  ),
  make(
    "reading-room-tone-in-the-pauses",
    "human",
    "constructed reading: a floor in the pauses high enough to be a room",
    withReading(base, ROOM_TONE_READING),
    "We wrote these numbers to fire the counter rule and nothing else. NOT A RECORDING.",
  ),
  make(
    "reading-full-band-lossless",
    "human",
    "constructed reading: uncompressed with energy all the way up, and an ordinary floor",
    withReading(base, FULL_BAND_READING),
    "We wrote these numbers to fire NOTHING. It is the mutation partner of the spectral case. NOT A RECORDING.",
  ),
];

export const AUDIO_AMBIGUOUS: readonly CorpusCase<AudioArtifact>[] = [
  make(
    "mixed-tool-declared",
    "unknown",
    "constructed WAVE declaring a tool that has both paths",
    audioVariant(base, { kind: "declare-mixed-tool" }),
    "An edit step names a tool whose generative feature and whose manual features are both in daily use.",
  ),
];

export const AUDIO_CORPUS: readonly CorpusCase<AudioArtifact>[] = [
  ...AUDIO_NEGATIVES,
  ...AUDIO_POSITIVES,
  ...AUDIO_LAUNDERED,
  ...AUDIO_AMBIGUOUS,
  ...AUDIO_MEASURED,
];

/**
 * The refusal, exported so a UI and a test can print it rather than paraphrase it.
 *
 * A product that publishes an abstention rate has to be able to say what the rate was
 * computed over, and the honest answer here is "constructed files and constructed readings".
 * Saying so is the difference between a published metric and a marketing figure.
 */
export const AUDIO_CORPUS_REFUSAL =
  "There is no corpus of real recordings behind this detector, and that is a refusal rather than a gap. A human " +
  "side would have to be audio whose maker, microphone and room are known, and speech scraped off the internet is " +
  "not that. On the other side, what we hold is first-party text-to-speech output, and its vendor terms bar using " +
  "it to develop, test or improve anything, which is exactly what fitting a threshold against it would be. So " +
  "this corpus is constructed files and constructed readings, every member says so, and no rate computed " +
  "over it is a false-positive rate. This detector ships abstaining by default because that is what the evidence " +
  "available to it supports.";

