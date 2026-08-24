import type { CorpusCase } from "@slop/core";
import { synthMp4 } from "@slop/provenance";
import { ingestVideo, neutralVideo, videoVariant } from "../artifact.js";
import type { VideoArtifact } from "../artifact.js";

/**
 * The video corpus, and the same honesty note as the image one.
 *
 * These are constructed ISO base media files, not footage. The label states what each file
 * DECLARES, which is the only thing this detector reads. Nothing computed here is a
 * false-positive rate, and this detector ships abstaining by default for that reason.
 *
 * There is one extra thing this corpus has to prove that the image one does not: that the
 * single probabilistic rule cannot, on its own, turn silence into a verdict.
 */
const CAPTURED_AT = "2026-08-23T00:00:00.000Z";
const STRUCTURAL =
  "Constructed for this suite from the ISO base media specification. The label states what the FILE DECLARES. It " +
  "is not footage and no rate computed over this corpus is a false-positive rate.";

const make = (
  id: string,
  label: CorpusCase<VideoArtifact>["label"],
  source: string,
  artifact: VideoArtifact,
  provenance: string,
): CorpusCase<VideoArtifact> => ({ id, label, source, provenance: `${provenance} ${STRUCTURAL}`, artifact, capturedAt: CAPTURED_AT });

const base = neutralVideo();
const mp4 = (id: string, options: Parameters<typeof synthMp4>[0]): VideoArtifact =>
  ingestVideo(synthMp4(options), { locator: `corpus://${id}.mp4`, mediaType: "video/mp4", capturedAt: CAPTURED_AT });

const PHONE = { "©mak": "Apple", "©mod": "iPhone 15 Pro", "©too": "17.5.1" };

export const VIDEO_NEGATIVES: readonly CorpusCase<VideoArtifact>[] = [
  make(
    "phone-recording",
    "human",
    "constructed MOV with QuickTime brands and capture-device atoms",
    mp4("phone-recording", { brands: ["qt  ", "qt  "], timescale: 600, width: 1920, height: 1080, udta: PHONE }),
    "Declares a make, a model and the phone's own OS build as its writer.",
  ),
  make(
    "camera-recording-4k",
    "human",
    "constructed MOV at a standard capture resolution",
    mp4("camera-recording-4k", {
      brands: ["qt  ", "qt  "],
      timescale: 600,
      width: 3840,
      height: 2160,
      udta: { "©mak": "Sony", "©mod": "ILCE-7M4", "©too": "3.01" },
    }),
    "A standard capture resolution with capture-device atoms. Must never be read as a screen geometry.",
  ),
  make(
    "edit-suite-export",
    "human",
    "constructed MOV declaring several hand-driven edit steps",
    videoVariant(base, { kind: "hand-edit-history", steps: 4 }),
    "Declares four edit steps in hand-driven editing applications and no tool from the signature table.",
  ),
  make(
    "c2pa-verified-capture",
    "human",
    "constructed MOV with a verifier's capture result attached",
    videoVariant(base, {
      kind: "content-credential",
      state: "verified",
      claimGenerator: "Sony ILCE-7M4",
      digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture",
    }),
    "Carries a Content Credential that a verifier validated, asserting a camera capture.",
  ),
  make(
    "c2pa-located-but-unverified",
    "human",
    "constructed MOV with a manifest box this build did not verify",
    videoVariant(base, { kind: "content-credential", state: "unverified" }),
    "Carries a Content Credential box whose signature this build cannot check, alongside capture-device atoms.",
  ),
];

export const VIDEO_POSITIVES: readonly CorpusCase<VideoArtifact>[] = [
  make(
    "xmp-declares-generative-tool",
    "generated",
    "constructed MOV whose XMP names a generative-only service",
    videoVariant(base, { kind: "declare-generative-tool" }),
    "An XMP creator-tool property names a service whose whole output is trained-algorithmic media.",
  ),
  make(
    "iptc-trained-algorithmic",
    "generated",
    "constructed MOV with an unsigned IPTC source type",
    videoVariant(base, { kind: "declare-source-type", value: "trainedAlgorithmicMedia" }),
    "Declares a trained-algorithmic source type in unsigned metadata.",
  ),
  make(
    "c2pa-verified-trained-algorithmic",
    "generated",
    "constructed MOV with a verifier's trained-algorithmic result attached",
    videoVariant(base, {
      kind: "content-credential",
      state: "verified",
      claimGenerator: "a video generation service",
      digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
    }),
    "Carries a validated Content Credential whose action assertion declares a trained-algorithmic source.",
  ),
  make(
    "encoder-declares-generative-service",
    "generated",
    "constructed MOV whose encoder atom names a generative-only service",
    videoVariant(base, { kind: "encoder", value: "Adobe Firefly 1.0" }),
    "The container's own writer atom names a service whose whole output is trained-algorithmic media.",
  ),
  make(
    "watermark-reported-by-external-detector",
    "generated",
    "constructed MOV with a caller-supplied watermark result",
    videoVariant(base, { kind: "watermark", detector: "the scheme owner's detector, v3" }),
    "A named external detector reported a watermark. This build ships no such detector; the result was supplied.",
  ),
];

export const VIDEO_LAUNDERED: readonly CorpusCase<VideoArtifact>[] = [
  make(
    "platform-transcode",
    "unknown",
    "constructed MP4 with generic brands and an ffmpeg writer atom",
    mp4("platform-transcode", { udta: { "©too": "Lavf60.16.100" }, width: 1080, height: 1920 }),
    "A transcoder named itself as the writer, so these are not the bytes the original tool produced.",
  ),
  make(
    "handbrake-reencode",
    "unknown",
    "constructed MP4 re-encoded by a desktop transcoder",
    mp4("handbrake-reencode", { udta: { "©too": "HandBrake 1.8.2" }, width: 1280, height: 720 }),
    "A desktop transcoder named itself as the writer.",
  ),
  make(
    "bare-download",
    "unknown",
    "constructed MP4 with generic brands and no atoms at all",
    mp4("bare-download", { brands: ["isom", "isom", "mp42"], timescale: 90_000, width: 1920, height: 1080, udta: {} }),
    "Generic brands, a muxer timescale and no capture-device atoms, of the shape a platform download produces.",
  ),
];

/** A file that declares nothing. The most common outcome there is. */
export const VIDEO_SILENT: readonly CorpusCase<VideoArtifact>[] = [
  make(
    "no-declaration",
    "human",
    "constructed MOV with capture-device atoms only",
    mp4("no-declaration", { brands: ["qt  ", "qt  "], timescale: 600, width: 1920, height: 1080, udta: { "©mak": "GoPro", "©mod": "HERO12" } }),
    "Declares a capture device and nothing else. The expected outcome is silence.",
  ),
];

/** A tool with both manual and generative paths. Genuinely ambiguous, and labelled so. */
export const VIDEO_AMBIGUOUS: readonly CorpusCase<VideoArtifact>[] = [
  make(
    "mixed-tool-declared",
    "unknown",
    "constructed MOV declaring a tool that has both paths",
    videoVariant(base, { kind: "declare-mixed-tool" }),
    "An edit step names a tool whose generative feature and whose manual features are both in daily use.",
  ),
];

export const VIDEO_CORPUS: readonly CorpusCase<VideoArtifact>[] = [
  ...VIDEO_NEGATIVES,
  ...VIDEO_POSITIVES,
  ...VIDEO_LAUNDERED,
  ...VIDEO_SILENT,
  ...VIDEO_AMBIGUOUS,
];

