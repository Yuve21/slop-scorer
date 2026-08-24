/**
 * The image calibration corpus, and an honest account of what it is.
 *
 * WHAT IT IS NOT. It is not a set of photographs. Nobody's camera produced these bytes, no
 * photographer's work is in this repository, and NOTHING COMPUTED FROM THIS CORPUS IS A
 * FALSE-POSITIVE RATE. `CONTRIBUTING.md` sets the bar for a real negative corpus — named
 * authorship, substantial pre-2022 history, an institution behind it, a provenance sentence a
 * stranger can go and check — and this does not clear it.
 *
 * WHY IT DOES NOT. A defensible image negative corpus needs licensed originals from named
 * photographers, and it needs them UNMODIFIED, because the whole subject of this detector is
 * what survives a re-save. Every large image set that is freely available has been through a
 * pipeline that stripped exactly the fields under test. Assembling a real one is a licensing
 * and logistics job with a cost, not a coding job, and inventing plausible-looking fixtures
 * and calling them photographs would be the same category of dishonesty this whole product is
 * built against. So it is not done here, and this paragraph exists so that nobody later reads
 * a green suite as evidence it was.
 *
 * WHAT IT IS. A STRUCTURAL corpus: real files, built to the container specifications, whose
 * label describes what each file DECLARES ABOUT ITSELF. That is exactly the thing this
 * detector reads, so the corpus is a faithful test of the detector even though it is not a
 * sample of the world. It does three jobs:
 *
 *   1. TRIPWIRE. A file that declares a capture, or declares nothing, must never be flagged.
 *      A rule change that starts flagging one fails loudly and names the rule.
 *   2. DISCRIMINATION. A file that declares a trained-algorithmic source must still be scored,
 *      so a corpus of dead rules cannot pass the tripwire by finding nothing anywhere.
 *   3. ABSTENTION ACCOUNTING. The share of members on which no score is reported, computed
 *      per run and printed. It is the headline metric for this package.
 *
 * The consequence of all this, stated plainly: THIS DETECTOR SHIPS ABSTAINING BY DEFAULT. It
 * reports only what a file declares, and until there is a real corpus behind it there is no
 * basis on which it should do anything else.
 */

import type { CorpusCase } from "@slop/core";
import { synthJpeg, synthPng } from "@slop/provenance";
import { ingestImage, imageVariant, neutralImage } from "../artifact.js";
import type { ImageArtifact } from "../artifact.js";

const CAPTURED_AT = "2026-08-23T00:00:00.000Z";

const STRUCTURAL =
  "Constructed for this suite from the container specification. The label states what the FILE DECLARES, which is " +
  "the only thing this detector reads. It is not a photograph and no rate computed over this corpus is a " +
  "false-positive rate.";

const make = (
  id: string,
  label: CorpusCase<ImageArtifact>["label"],
  source: string,
  artifact: ImageArtifact,
  provenance: string,
): CorpusCase<ImageArtifact> => ({ id, label, source, provenance: `${provenance} ${STRUCTURAL}`, artifact, capturedAt: CAPTURED_AT });

const base = neutralImage();

const jpeg = (id: string, options: Parameters<typeof synthJpeg>[0]): ImageArtifact =>
  ingestImage(synthJpeg(options), { locator: `corpus://${id}.jpg`, mediaType: "image/jpeg", capturedAt: CAPTURED_AT });

const png = (id: string, options: Parameters<typeof synthPng>[0]): ImageArtifact =>
  ingestImage(synthPng(options), { locator: `corpus://${id}.png`, mediaType: "image/png", capturedAt: CAPTURED_AT });

const CAMERA_EXIF = {
  Make: "FUJIFILM",
  Model: "X-T5",
  DateTimeOriginal: "2024:09:02 17:03:44",
  DateTime: "2024:09:02 17:03:44",
};

const xmp = (body: string): string =>
  `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF ` +
  `xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:xmp="http://ns.adobe.com/xap/1.0/" ` +
  `xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/" xmlns:stEvt="http://ns.adobe.com/xap/1.0/sType/ResourceEvent#" ` +
  `xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"><rdf:Description>${body}` +
  `</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;

/**
 * Files that declare a capture, or declare nothing at all. NONE of these may be flagged.
 */
export const IMAGE_NEGATIVES: readonly CorpusCase<ImageArtifact>[] = [
  make(
    "camera-original-with-makernote",
    "human",
    "constructed JPEG, Fujifilm-shaped EXIF",
    jpeg("camera-original-with-makernote", {
      width: 6048,
      height: 4024,
      quant: "camera",
      makerNoteBytes: 1_024,
      exif: CAMERA_EXIF,
    }),
    "Declares a make, a model, a capture time and a vendor MakerNote, with bespoke quantisation tables.",
  ),
  make(
    "camera-original-no-makernote",
    "human",
    "constructed JPEG, minimal camera EXIF",
    jpeg("camera-original-no-makernote", {
      width: 4032,
      height: 3024,
      quant: "camera",
      exif: { Make: "NIKON CORPORATION", Model: "NIKON Z 6_2", DateTimeOriginal: "2021:06:14 08:41:02" },
    }),
    "Declares a capture and nothing else. The expected outcome is silence, which is the most common outcome there is.",
  ),
  make(
    "raw-converter-export",
    "human",
    "constructed JPEG, raw-converter software tag",
    jpeg("raw-converter-export", {
      width: 6048,
      height: 4024,
      quant: "camera",
      makerNoteBytes: 900,
      exif: { ...CAMERA_EXIF, Software: "Capture One 23" },
    }),
    "Declares an ordinary raw converter as its writer, alongside full capture metadata.",
  ),
  make(
    "hand-edit-history",
    "human",
    "constructed JPEG, four-step XMP history",
    jpeg("hand-edit-history", {
      width: 5000,
      height: 3333,
      quant: "camera",
      makerNoteBytes: 700,
      exif: CAMERA_EXIF,
      xmp: xmp(
        ["Capture One 23", "Adobe Photoshop 25.9", "Affinity Photo 2.5", "Nikon NX Studio 1.6"]
          .map((a) => `<stEvt:softwareAgent>${a}</stEvt:softwareAgent>`)
          .join(""),
      ),
    }),
    "Declares four edit steps in hand-driven applications and no tool from the signature table.",
  ),
  make(
    "declared-digital-art",
    "human",
    "constructed JPEG, IPTC digitalArt",
    jpeg("declared-digital-art", {
      width: 3000,
      height: 4000,
      quant: "camera",
      exif: CAMERA_EXIF,
      xmp: xmp(
        "<Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/digitalArt</Iptc4xmpExt:DigitalSourceType>",
      ),
    }),
    "Declares a digitalArt source type, which is an illustrator saying they drew it. Must never be flagged.",
  ),
  make(
    "c2pa-verified-capture",
    "human",
    "constructed JPEG with a verifier's capture result attached",
    imageVariant(base, {
      kind: "content-credential",
      state: "verified",
      claimGenerator: "Leica M11-P",
      digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture",
    }),
    "Carries a Content Credential that a verifier validated, asserting a camera capture.",
  ),
  make(
    "c2pa-located-but-unverified",
    "human",
    "constructed JPEG with a manifest box this build did not verify",
    imageVariant(base, { kind: "content-credential", state: "unverified" }),
    "Carries a Content Credential box whose signature this build cannot check, alongside capture metadata.",
  ),
];

/** Files that declare a trained-algorithmic source or a generative-only tool. */
export const IMAGE_POSITIVES: readonly CorpusCase<ImageArtifact>[] = [
  make(
    "sd-webui-parameters",
    "generated",
    "constructed PNG with an AUTOMATIC1111-shaped text chunk",
    png("sd-webui-parameters", {
      width: 1024,
      height: 1024,
      text: {
        parameters:
          "a wide shot of a harbour at dawn\nSteps: 28, Sampler: DPM++ 2M Karras, CFG scale: 7, Seed: 1284471096",
      },
    }),
    "The tool wrote its own generation call into a PNG text chunk keyed `parameters`.",
  ),
  make(
    "comfyui-graph",
    "generated",
    "constructed PNG with a ComfyUI node graph",
    png("comfyui-graph", {
      width: 1152,
      height: 896,
      text: { prompt: '{"3":{"class_type":"KSampler","inputs":{"seed":42,"steps":24}}}' },
    }),
    "The tool serialised its executed node graph into a PNG text chunk keyed `prompt`.",
  ),
  make(
    "firefly-writer-field",
    "generated",
    "constructed JPEG whose EXIF Software names a generative-only service",
    jpeg("firefly-writer-field", { width: 2048, height: 2048, quant: "camera", exif: { Software: "Adobe Firefly 1.0" } }),
    "The container's own writer field names a service whose whole output is trained-algorithmic media.",
  ),
  make(
    "iptc-trained-algorithmic",
    "generated",
    "constructed JPEG with an unsigned IPTC source type",
    jpeg("iptc-trained-algorithmic", {
      width: 2048,
      height: 1152,
      quant: "camera",
      exif: CAMERA_EXIF,
      xmp: xmp(
        "<Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType>",
      ),
    }),
    "Declares a trained-algorithmic source type in unsigned metadata.",
  ),
  make(
    "c2pa-verified-trained-algorithmic",
    "generated",
    "constructed JPEG with a verifier's trained-algorithmic result attached",
    imageVariant(base, {
      kind: "content-credential",
      state: "verified",
      claimGenerator: "Adobe Firefly 1.0",
      digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
    }),
    "Carries a validated Content Credential whose action assertion declares a trained-algorithmic source.",
  ),
  make(
    "watermark-reported-by-external-detector",
    "generated",
    "constructed JPEG with a caller-supplied watermark result",
    imageVariant(base, { kind: "watermark", detector: "the scheme owner's detector, v3" }),
    "A named external detector reported a watermark. This build ships no such detector; the result was supplied.",
  ),
];

/**
 * Files that reached us re-encoded. Every one must produce `artifact_re_encoded` and NO score.
 *
 * Labelled `unknown` on purpose. That is the whole point of the gate: a screenshot of a
 * photograph and a screenshot of a generated image are the same artifact to us, and the
 * corpus must not pretend to know which it is holding.
 */
export const IMAGE_LAUNDERED: readonly CorpusCase<ImageArtifact>[] = [
  make(
    "phone-screenshot",
    "unknown",
    "constructed JPEG at an exact phone screen geometry",
    jpeg("phone-screenshot", { width: 1170, height: 2532, jfif: true, quant: 80, chroma: "4:2:0" }),
    "JFIF header, libjpeg quality ladder, exact screen geometry, no capture metadata.",
  ),
  make(
    "messenger-recompress",
    "unknown",
    "constructed JPEG re-saved at a low quality with everything stripped",
    jpeg("messenger-recompress", { width: 1600, height: 1200, jfif: true, quant: 70, chroma: "4:2:0" }),
    "A lossy re-save with no metadata of any kind, of the shape a messaging pipeline produces.",
  ),
  make(
    "declared-screen-capture",
    "unknown",
    "constructed JPEG whose writer field names a screen-capture tool",
    jpeg("declared-screen-capture", { width: 2400, height: 1350, jfif: true, quant: 92, exif: { Software: "CleanShot X 4.6" } }),
    "The file names a screen-capture tool as its writer, so whatever it depicts has been re-rendered.",
  ),
  make(
    "desktop-screenshot-png",
    "unknown",
    "constructed PNG at an exact scaled-desktop geometry",
    png("desktop-screenshot-png", { width: 1512, height: 982 }),
    "Lossless, but at an exact desktop geometry with no metadata: a screen capture rather than a re-save.",
  ),
];

/** A tool with both manual and generative paths. Genuinely ambiguous, and labelled so. */
export const IMAGE_AMBIGUOUS: readonly CorpusCase<ImageArtifact>[] = [
  make(
    "mixed-tool-declared",
    "unknown",
    "constructed JPEG declaring a tool that has both paths",
    imageVariant(base, { kind: "declare-mixed-tool" }),
    "An edit step names a tool whose generative feature and whose manual features are both in daily use.",
  ),
];

export const IMAGE_CORPUS: readonly CorpusCase<ImageArtifact>[] = [
  ...IMAGE_NEGATIVES,
  ...IMAGE_POSITIVES,
  ...IMAGE_LAUNDERED,
  ...IMAGE_AMBIGUOUS,
];
