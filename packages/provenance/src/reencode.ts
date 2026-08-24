/**
 * THE RE-ENCODING GATE. The most important code in these three packages.
 *
 * Everything else here answers "what did the file declare?". This module answers the prior
 * question: "are these even the original bytes?" — and when the answer is no, it stops the
 * rest of the pipeline from emitting a score at all.
 *
 * WHY IT OUTRANKS EVERY RULE
 *
 * `image-detection-reality.md` establishes, from independent measurement rather than vendor
 * material, that a lossy re-encode is the condition under which detection collapses:
 * artifact-driven methods fall to chance at ordinary JPEG quality settings (arXiv 2607.14684),
 * a mild resize-plus-JPEG costs gradient methods most of their separation (arXiv 2412.17671),
 * and mild JPEG on text-rich images halves and halves again the F-measure of a recent method
 * (arXiv 2606.19259). Bellingcat's practical version: recompressing machine-made images to a
 * few hundred kilobytes flipped most of them to "real" in a shipping commercial tool. And a
 * SCREENSHOT — the single most likely thing a user will hand us — does all of it at once:
 * it replaces the encoder, resamples the pixels, strips EXIF and XMP, and destroys any C2PA
 * hard binding. All four detection families degrade simultaneously and nobody has published
 * a solution.
 *
 * So the honest output for a laundered artifact is not a lower score, not a wider confidence
 * interval, and not a hedged sentence. It is `status: "inconclusive"` with a coded reason and
 * NO NUMBER. That is a product feature we advertise, and it is the one thing in this category
 * nobody else does.
 *
 * WHAT THE GATE IS AND IS NOT
 *
 * Every indicator below is an observation about the CONTAINER: a marker, a table sum, a box,
 * a declared tag, a dimension. None of them is about content, and none of them is evidence
 * about origin in either direction. A screenshot of a photograph and a screenshot of a
 * generated image trip this identically, which is precisely the point — the gate does not
 * know or care which it is looking at, it only knows it can no longer tell.
 *
 * The weights are a triage budget, not probabilities, and the module never states one.
 */

import { at } from "./container/bytes.js";
import type { ContainerRecord } from "./container/types.js";
import type { C2paRecord } from "./c2pa.js";
import type { MetadataRecord } from "./metadata.js";

export type LaunderingCode =
  | "lossy_requantisation"
  | "encoder_is_not_a_capture_device"
  | "capture_metadata_absent"
  | "transcoder_tag"
  | "container_profile_is_generic"
  | "declared_screen_capture"
  | "display_resolution_geometry"
  | "encoder_chain_conflict"
  | "lossless_resave";

/** A pristine marker: something only an unmodified original carries. Subtracts from the score. */
export type PristineCode =
  | "camera_maker_note"
  | "camera_make_model"
  | "content_credential_present"
  | "non_ijg_quantisation"
  | "uncompressed_audio"
  | "capture_device_atoms";

export interface LaunderingIndicator {
  readonly code: LaunderingCode;
  readonly title: string;
  /** Triage weight. The gate trips at 1.0. Never presented as a probability. */
  readonly weight: number;
  readonly locator: string;
  readonly observed: string;
  readonly detail: string;
}

export interface PristineMarker {
  readonly code: PristineCode;
  readonly title: string;
  /** Negative. Subtracted from the laundering score. */
  readonly weight: number;
  readonly locator: string;
  readonly observed: string;
}

export interface LaunderingRecord {
  readonly indicators: readonly LaunderingIndicator[];
  readonly pristine: readonly PristineMarker[];
  /** Sum of indicator weights plus pristine weights, floored at zero. */
  readonly score: number;
  readonly threshold: number;
  /** The gate. True means no modality rule may run and no score may be emitted. */
  readonly laundered: boolean;
  /** The codes that carried it, for a dashboard and an appeal. */
  readonly codes: readonly LaunderingCode[];
}

/** The gate trips here. One strong indicator, or two moderate ones. */
export const LAUNDERING_THRESHOLD = 1;

/**
 * Display geometries, and the ones deliberately left OUT.
 *
 * An artifact whose exact pixel dimensions are a phone screen or a desktop display did not
 * come out of a sensor at that size. The list is EXACT-MATCH: a "close to 1080 wide" test
 * would catch half the photographs ever taken, and a rule that fires on half of everything
 * is not a rule.
 *
 * The first version of this table included 1920x1080, 1280x720, 3840x2160 and 1080x1920, and
 * that was a false-positive generator of the worst kind: those are the standard CAPTURE
 * resolutions of every video camera and phone made this decade, so the gate would have
 * abstained on essentially all real video while claiming to have spotted a screenshot. They
 * are absent on purpose, and this note is here so nobody helpfully adds them back.
 */
const DISPLAY_GEOMETRIES: readonly { readonly w: number; readonly h: number; readonly what: string }[] = [
  { w: 1170, h: 2532, what: "iPhone 12/13/14 screen" },
  { w: 1179, h: 2556, what: "iPhone 14 Pro/15 screen" },
  { w: 1290, h: 2796, what: "iPhone 14 Pro Max/15 Plus screen" },
  { w: 1284, h: 2778, what: "iPhone 12/13 Pro Max screen" },
  { w: 1125, h: 2436, what: "iPhone X/XS/11 Pro screen" },
  { w: 750, h: 1334, what: "iPhone 6-8 screen" },
  { w: 1440, h: 3120, what: "Android flagship screen" },
  { w: 1512, h: 982, what: "14-inch MacBook Pro default scaled desktop" },
  { w: 1728, h: 1117, what: "16-inch MacBook Pro default scaled desktop" },
  { w: 2880, h: 1800, what: "MacBook Pro Retina backing store" },
  { w: 1366, h: 768, what: "common laptop display" },
];

/** Tools whose declared presence in a Software field means "this is a capture of a screen". */
const SCREEN_CAPTURE_TOOLS: readonly RegExp[] = [
  /^screenshot\b/i,
  /^greenshot\b/i,
  /^snagit\b/i,
  /^shottr\b/i,
  /^cleanshot\b/i,
  /^flameshot\b/i,
  /^lightshot\b/i,
  /^windows (snipping tool|photo editor)\b/i,
  /^gnome-screenshot\b/i,
  /^screencapture\b/i,
];

/** Encoder names that are transcoders. Their presence means the bytes were rewritten. */
const TRANSCODER_TAGS: readonly RegExp[] = [
  /^lavf/i,
  /^lavc/i,
  /^ffmpeg/i,
  /^handbrake/i,
  /^x264/i,
  /^x265/i,
  /^gpac/i,
  /^mp4box/i,
  /^shutter encoder/i,
  /^imagemagick/i,
  /^graphicsmagick/i,
  /^gd-jpeg/i,
  /^libjpeg/i,
  /^mozjpeg/i,
  /^sharp\b/i,
];

/**
 * Assess whether the artifact reached us re-encoded, resampled, screenshotted or
 * platform-processed. Pure over already-collected observations: no I/O, no model, no pixels.
 */
export function assessLaundering(
  container: ContainerRecord,
  metadata: MetadataRecord,
  c2pa: C2paRecord,
): LaunderingRecord {
  const indicators: LaunderingIndicator[] = [];
  const pristine: PristineMarker[] = [];
  const loc = (offset: number): string => `${container.format}:${at(offset)}`;

  // ---- declared screen capture -----------------------------------------------------------
  for (const field of metadata.fields) {
    if (!/software|creatortool|originatingprogram|agent/i.test(field.name)) continue;
    if (!SCREEN_CAPTURE_TOOLS.some((re) => re.test(field.value.trim()))) continue;
    indicators.push({
      code: "declared_screen_capture",
      title: "The file names a screen-capture tool as its writer",
      weight: 1.2,
      locator: field.locator,
      observed: `${field.name} = ${field.value}`,
      detail:
        "A screen capture is a fresh render of already-rendered pixels. Whatever the original was, its encoding, " +
        "its sampling grid and its sidecar metadata are gone.",
    });
    break;
  }

  // ---- transcoder tag --------------------------------------------------------------------
  if (container.encoder && TRANSCODER_TAGS.some((re) => re.test(container.encoder!.value.trim()))) {
    indicators.push({
      code: "transcoder_tag",
      title: "A transcoder named itself as the writer of these bytes",
      weight: 1.1,
      locator: loc(container.encoder.offset),
      observed: `${container.encoder.field} = ${container.encoder.value}`,
      detail:
        "This field is written by the library that produced the file. Its presence means the bytes we have were " +
        "produced by re-encoding something else, whatever that something else was.",
    });
  }

  // ---- geometry --------------------------------------------------------------------------
  const { width, height } = container.shape;
  if (width && height) {
    const hit = DISPLAY_GEOMETRIES.find(
      (g) => (g.w === width && g.h === height) || (g.h === width && g.w === height),
    );
    if (hit) {
      indicators.push({
        code: "display_resolution_geometry",
        title: "The pixel dimensions are exactly a display or platform output size",
        weight: 0.7,
        locator: container.segments[0] ? loc(container.segments[0].offset) : `${container.format}:dimensions`,
        observed: `${width}x${height} (${hit.what})`,
        detail:
          "Sensors and rendering pipelines do not naturally produce a display's exact pixel count. This geometry " +
          "is what a screenshot or a platform's own resize step produces.",
      });
    }
  }

  // ---- JPEG ------------------------------------------------------------------------------
  if (container.jpeg) {
    const j = container.jpeg;
    const dqt = container.segments.find((s) => s.name === "DQT");
    const quality = j.qualityEstimate;
    if (quality !== null && quality <= 95) {
      indicators.push({
        code: "lossy_requantisation",
        title: "The quantisation tables sit on the standard libjpeg quality ladder, below maximum",
        weight: 0.8,
        locator: dqt ? loc(dqt.offset) : `${container.format}:DQT`,
        observed: `luma table sum ${j.quantTableSums[0]}, inverts to quality ${quality} on the IJG ladder`,
        detail:
          "A camera writes its own tuned tables. A table that inverts cleanly onto the reference ladder at a " +
          "chosen quality is what a software encoder writes when it re-saves an image.",
      });
    } else if (quality === null && j.quantTableSums.length > 0) {
      pristine.push({
        code: "non_ijg_quantisation",
        title: "The quantisation tables are not on the standard ladder",
        weight: -0.4,
        locator: dqt ? loc(dqt.offset) : `${container.format}:DQT`,
        observed: `luma table sum ${j.quantTableSums[0]}`,
      });
    }

    if (j.jfif && !metadata.hasCaptureTime && !metadata.make) {
      const app0 = container.segments.find((s) => s.name === "APP0");
      indicators.push({
        code: "encoder_is_not_a_capture_device",
        title: "A JFIF header with no capture metadata at all",
        weight: 0.5,
        locator: app0 ? loc(app0.offset) : `${container.format}:APP0`,
        observed: "APP0 JFIF present; no EXIF Make, Model or capture time",
        detail:
          "The JFIF marker is written by the libjpeg family. A file that has one and carries nothing a camera " +
          "writes was produced by a software encoder rather than handed over by a device.",
      });
    }

    if (j.trailingBytes > 0) {
      indicators.push({
        code: "container_profile_is_generic",
        title: "Bytes follow the end-of-image marker",
        weight: 0.3,
        locator: `${container.format}:${at(container.byteLength - j.trailingBytes)}`,
        observed: `${j.trailingBytes} byte(s) after EOI`,
        detail: "A tool appended to this file after the image data ended. Common in messaging and CDN pipelines.",
      });
    }
  }

  // ---- PNG: lossless, and the research says that matters ---------------------------------
  if (container.format === "png") {
    // Recorded at a weight that CANNOT trip the gate on its own, on purpose. The measured
    // degradation is caused by the lossy codec, not by the act of re-saving: a PNG re-encode
    // left the same method's F-measure intact in the study that halved it under mild JPEG.
    // Treating a PNG re-save as laundering would abstain on a huge class of artifacts we can
    // still honestly read, and abstention has a cost too.
    const idat = container.segments.find((s) => s.name === "IDAT");
    if (idat && container.payloads.length === 0 && metadata.fields.length === 0) {
      indicators.push({
        code: "lossless_resave",
        title: "A PNG with no metadata of any kind",
        weight: 0.35,
        locator: loc(idat.offset),
        observed: "no tEXt, iTXt, eXIf or XMP chunk present",
        detail:
          "Consistent with a re-save, an export, or a tool that simply writes no metadata. Weighted so it cannot " +
          "trip this gate alone: a lossless re-encode does not destroy the signal a lossy one does.",
      });
    }
  }

  // ---- ISO-BMFF --------------------------------------------------------------------------
  if (container.format === "iso-bmff") {
    const hasCameraAtoms = metadata.fields.some((f) => /^(make|model)$/i.test(f.name) && f.value.length > 0);
    const ftyp = container.segments.find((s) => s.name === "ftyp");
    const brands = container.shape.brands ?? [];
    if (!hasCameraAtoms && ftyp && brands.some((b) => b === "isom" || b === "mp42" || b === "mp41")) {
      indicators.push({
        code: "container_profile_is_generic",
        title: "A generic MP4 brand set with no capture-device atoms",
        // 0.75, so that this plus a muxer timescale reaches the threshold on its own. Video is
        // the modality where almost nothing arrives as recorded: a bare isom/mp42 file with no
        // make, no model and no writer atom is the platform-download fingerprint, and treating
        // it as readable would put a score on the platform's transcode rather than on anything
        // the producer wrote.
        weight: 0.75,
        locator: loc(ftyp.offset),
        observed: `ftyp brands: ${brands.join(" ")}`,
        detail:
          "Phone and camera recorders write their own brands and a make/model atom. A bare isom/mp42 file with " +
          "neither is what a transcode or a platform download produces.",
      });
    }
    if (hasCameraAtoms) {
      const field = metadata.fields.find((f) => /^(make|model)$/i.test(f.name))!;
      pristine.push({
        code: "capture_device_atoms",
        title: "The container names a capture device",
        weight: -0.6,
        locator: field.locator,
        observed: `${field.name} = ${field.value}`,
      });
    }
    if (container.shape.timescale === 90_000 || container.shape.timescale === 1_000) {
      const mvhd = container.segments.find((s) => s.name.endsWith("/mvhd"));
      indicators.push({
        code: "container_profile_is_generic",
        title: "The movie timescale is a transcoder convention",
        weight: 0.25,
        locator: mvhd ? loc(mvhd.offset) : `${container.format}:mvhd`,
        observed: `timescale ${container.shape.timescale}`,
        detail: "Recorders pick a timescale from the sensor's frame rate; 90000 and 1000 are muxer defaults.",
      });
    }
  }

  // ---- audio -----------------------------------------------------------------------------
  if (container.format === "mpeg-audio") {
    const conflict = container.payloads.find((p) => p.fields["conflictingEncoder"]);
    if (conflict) {
      indicators.push({
        code: "encoder_chain_conflict",
        title: "Two different encoders are named in the same file",
        weight: 1.1,
        locator: loc(conflict.offset),
        observed: `${conflict.fields["declaredEncoder"]} in the tag, ${conflict.fields["conflictingEncoder"]} in the frame header`,
        detail: "The bytes passed through at least two encoders, so what we have is not what the first one produced.",
      });
    } else {
      indicators.push({
        code: "lossy_requantisation",
        title: "The audio is in a lossy container",
        weight: 0.4,
        locator: container.segments[0] ? loc(container.segments[0].offset) : `${container.format}:0`,
        observed: container.shape.codec ?? "mpeg-1 layer 3",
        detail:
          "Perceptual coding discards the fine structure that any signal-level read would need, whether or not " +
          "this file was ever re-encoded.",
      });
    }
  }
  if (container.format === "riff-wave" && container.shape.codec === "pcm") {
    pristine.push({
      code: "uncompressed_audio",
      title: "The audio is uncompressed PCM",
      weight: -0.5,
      locator: container.segments[0] ? loc(container.segments[0].offset) : `${container.format}:0`,
      observed: `${container.shape.sampleRate} Hz, ${container.shape.bitDepth}-bit`,
    });
  }

  // ---- pristine markers, all formats ------------------------------------------------------
  if (metadata.hasMakerNote) {
    const field = metadata.fields.find((f) => f.name === "MakerNote");
    pristine.push({
      code: "camera_maker_note",
      title: "A camera MakerNote block is present",
      weight: -0.7,
      locator: field?.locator ?? `${container.format}:exif`,
      observed: field?.value ?? "present",
    });
  }
  if (metadata.make && metadata.model) {
    const field = metadata.fields.find((f) => f.name === "Make");
    pristine.push({
      code: "camera_make_model",
      title: "EXIF names a camera make and model",
      weight: -0.4,
      locator: field?.locator ?? `${container.format}:exif`,
      observed: `${metadata.make} ${metadata.model}`,
    });
  }
  if (c2pa.state !== "absent" && c2pa.locator) {
    pristine.push({
      code: "content_credential_present",
      title: "A Content Credential box survived intact",
      weight: -0.5,
      locator: c2pa.locator,
      observed: `${c2pa.state}, ${c2pa.byteLength} bytes`,
    });
  }
  // Still images only. A capture TIME lives in EXIF, which no video or audio container this
  // package reads carries, so applying this to an MP4 would tax every video ever recorded for
  // not having a field its format does not define.
  const STILL_FORMATS = new Set(["jpeg", "png", "webp", "gif"]);
  if (!metadata.hasCaptureTime && !metadata.hasMakerNote && STILL_FORMATS.has(container.format)) {
    indicators.push({
      code: "capture_metadata_absent",
      title: "No capture metadata of any kind",
      weight: 0.3,
      locator: `${container.format}:metadata`,
      observed: `${metadata.fields.length} metadata field(s) total, none of them a capture time or a MakerNote`,
      detail:
        "On its own this is nearly meaningless: plenty of legitimate pipelines strip metadata. Weighted so it " +
        "cannot trip the gate alone, and included because it corroborates the indicators that can.",
    });
  }

  const raw = indicators.reduce((a, i) => a + i.weight, 0) + pristine.reduce((a, p) => a + p.weight, 0);
  const score = Math.max(0, Math.round(raw * 100) / 100);
  return {
    indicators,
    pristine,
    score,
    threshold: LAUNDERING_THRESHOLD,
    laundered: score >= LAUNDERING_THRESHOLD,
    codes: [...new Set(indicators.map((i) => i.code))],
  };
}

/**
 * The sentence the gate prints. Says what WE observed and what WE therefore will not do.
 *
 * It cites the reason the abstention exists — the measured collapse of every detection
 * family under this transform — by naming the studies rather than by quoting a figure. The
 * figures belong in the research file and in a computation, never hardcoded in a shipped
 * string: `no-claims.test.ts` is the standing enforcement of that and this line honours it.
 */
export function launderingDetail(record: LaunderingRecord): string {
  const list = record.indicators
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .map((i) => `${i.title} (${i.locator}: ${i.observed})`)
    .join("; ");
  return (
    `This artifact reached us re-encoded or re-rendered rather than as produced. What we observed: ${list}. ` +
    `Independent measurement of detectors under exactly this transform (arXiv 2412.17671, 2606.19259, 2607.14684, ` +
    `and Bellingcat's recompression trial) puts pixel-level, frequency and watermark reads at or near chance, and ` +
    `the same transform strips the provenance a manifest would have carried. All four families degrade at once, so ` +
    `we are not reporting a number for it. That is the honest answer, not a failure of this run.`
  );
}
