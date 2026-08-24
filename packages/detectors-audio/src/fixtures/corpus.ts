import type { CorpusCase } from "@slop/core";
import { synthMp3, synthWav } from "@slop/provenance";
import { audioVariant, ingestAudio, neutralAudio } from "../artifact.js";
import type { AudioArtifact } from "../artifact.js";

/**
 * The audio corpus, with the same honesty note as the other two.
 *
 * These are constructed RIFF and MPEG audio files, not recordings. The label states what each
 * file DECLARES. Nothing computed here is a false-positive rate, and this detector ships
 * abstaining by default for that reason.
 *
 * The corpus is deliberately smaller than the image one, and the reason is worth stating: the
 * audio modality has fewer honest signals available to it than the other two. Voice cloning
 * is contractually closed on the reproduction side, signal analysis is ruled out by the same
 * argument that rules out pixel forensics, and Content Credentials in audio are close to
 * nonexistent in the wild. What is left is the writer field and the tags, and a small corpus
 * is the accurate reflection of a small surface rather than an incomplete job.
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

export const AUDIO_AMBIGUOUS: readonly CorpusCase<AudioArtifact>[] = [
  make(
    "mixed-tool-declared",
    "unknown",
    "constructed WAVE declaring a tool that has both paths",
    audioVariant(base, { kind: "declare-mixed-tool" }),
    "An edit step names a tool whose generative feature and whose manual features are both in daily use.",
  ),
];

export const AUDIO_CORPUS: readonly CorpusCase<AudioArtifact>[] = [...AUDIO_NEGATIVES, ...AUDIO_POSITIVES, ...AUDIO_LAUNDERED, ...AUDIO_AMBIGUOUS];

