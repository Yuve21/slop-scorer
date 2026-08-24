/**
 * The video artifact.
 *
 * One probe more than the shared five: `tracks`. It exists to carry the only probabilistic
 * signal in this entire product, audio/video desynchronisation, and it is deliberately the
 * only place a number that is not a byte offset is allowed in.
 *
 * The desync measurement is NOT computed here. This package does not decode a video: doing so
 * means a codec dependency, a frame pipeline and a face-landmark model, which is the road to
 * the pixel-forensic detector the research says we cannot defend. What it does instead is
 * accept a measurement from a named external measurer and report it, marked as probabilistic,
 * at a weight that cannot on its own move an artifact out of the lowest band.
 */

import type { ProbeStatus } from "@slop/core";
import {
  assessLaundering,
  ingestMedia,
  MEDIA_PROBE_WEIGHTS,
  mediaProbes,
  synthMp4,
  verifiedManifest,
} from "@slop/provenance";
import type { FixtureChange, MediaArtifact, MediaProbeId, WatermarkProbe } from "@slop/provenance";
import { DEFAULT_WATERMARK_PROBES } from "@slop/provenance";

/**
 * What we know about the streams inside the container.
 *
 * `trackCount` comes from the box walk and is a fact. `audioVideoOffsetMs` comes from
 * somebody else's measurement and is a claim, which is why `measuredBy` is required for it to
 * be usable at all: an unsourced number is not evidence.
 */
export interface StreamRecord {
  readonly trackCount: number;
  /** Milliseconds the audio leads (negative) or lags (positive) the video. Null when unmeasured. */
  readonly audioVideoOffsetMs: number | null;
  /** Who measured it. Null means nobody did, and the rule that reads it will not fire. */
  readonly measuredBy: string | null;
  readonly note: string;
}

export interface VideoArtifact extends MediaArtifact {
  readonly modality: "video";
  readonly streams: StreamRecord;
}

export type VideoProbeId = MediaProbeId | "tracks";

export const VIDEO_PROBE_WEIGHTS: Readonly<Record<VideoProbeId, number>> = {
  ...MEDIA_PROBE_WEIGHTS,
  tracks: 2,
};

export const UNMEASURED_STREAMS: StreamRecord = {
  trackCount: 0,
  audioVideoOffsetMs: null,
  measuredBy: null,
  note:
    "No audio/video alignment measurement was supplied. This build does not decode video, so it has no way to " +
    "produce one, and it draws nothing from the absence.",
};

export interface IngestVideoOptions {
  readonly locator: string;
  readonly mediaType?: string | null;
  readonly capturedAt?: string;
  readonly watermarks?: readonly WatermarkProbe[];
  /** A measurement from an external measurer, if the caller has one. */
  readonly streams?: Partial<StreamRecord>;
}

export function ingestVideo(bytes: Uint8Array, options: IngestVideoOptions): VideoArtifact {
  const base = ingestMedia(bytes, { ...options, modality: "video" });
  const trackCount = base.container.segments.filter((s) => s.name.endsWith("trak")).length;
  const streams: StreamRecord = { ...UNMEASURED_STREAMS, trackCount, ...options.streams };
  return withTrackProbe({ ...base, modality: "video", streams });
}

/** Add the modality's own probe on top of the shared five. */
function withTrackProbe(artifact: VideoArtifact): VideoArtifact {
  const probe: ProbeStatus = {
    id: "tracks",
    ran: true,
    denominator: artifact.streams.trackCount,
    expectsNonEmpty: true,
    weight: VIDEO_PROBE_WEIGHTS.tracks,
    note:
      "media tracks found in the box tree. Zero means the walk never reached a trak box, so anything said about " +
      "the streams below was said without looking at them.",
  };
  return { ...artifact, probes: [...artifact.probes.filter((p) => p.id !== "tracks"), probe] };
}

/**
 * The neutral video: a phone recording.
 *
 * QuickTime brands, a make and a model atom, an encoder atom naming the phone's own OS build,
 * a 600 timescale (Apple's convention, not a muxer's), 1920x1080. Nothing fires on it, and
 * the re-encoding gate stays open because the capture-device atoms outweigh the one weak
 * indicator a video always carries.
 */
export function neutralVideo(overrides: Partial<VideoArtifact> = {}): VideoArtifact {
  const bytes = phoneRecording({});
  const base = ingestVideo(bytes, {
    locator: "fixture://neutral.mov",
    mediaType: "video/quicktime",
    capturedAt: "2026-08-23T00:00:00.000Z",
  });
  return { ...base, ...overrides };
}

const BASE_UDTA: Readonly<Record<string, string>> = {
  "©mak": "Apple",
  "©mod": "iPhone 15 Pro",
  "©too": "17.5.1",
};

function phoneRecording(over: {
  udta?: Readonly<Record<string, string>>;
  c2paBox?: boolean;
  xmp?: string;
}): Uint8Array {
  return synthMp4({
    brands: ["qt  ", "qt  "],
    timescale: 600,
    durationSeconds: 12,
    width: 1920,
    height: 1080,
    udta: over.udta ?? BASE_UDTA,
    ...(over.xmp ? { xmp: over.xmp } : {}),
    ...(over.c2paBox ? { c2paBox: true } : {}),
  });
}

/**
 * An XMP packet written into a real `XMP_` box under `udta`.
 *
 * An MP4 has exactly one writer atom and no history chain, so the sidecar declarations the
 * shared corpus asks for live in XMP here, which is where a real editing suite puts them.
 */
const xmpPacket = (body: string): string =>
  `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/">` +
  `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:xmp="http://ns.adobe.com/xap/1.0/" ` +
  `xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/" xmlns:stEvt="http://ns.adobe.com/xap/1.0/sType/ResourceEvent#" ` +
  `xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"><rdf:Description>${body}` +
  `</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;

const step = (agent: string): string => `<stEvt:softwareAgent>${agent}</stEvt:softwareAgent>`;

/**
 * Realise a semantic fixture change as a real MP4.
 *
 * Two tokens have no home in an ISO-BMFF file and are implemented as the closest true thing:
 * a MakerNote (an EXIF structure, which MP4 does not carry) becomes an absent capture-device
 * atom set, and `strip-capture-metadata` removes the make and model atoms. Both are recorded
 * here rather than faked, because a fixture that pretended an MP4 had EXIF would be testing a
 * shape rather than a parser.
 */
export function videoVariant(base: VideoArtifact, change: FixtureChange): VideoArtifact {
  const rebuild = (bytes: Uint8Array): VideoArtifact => ({
    ...base,
    ...ingestVideo(bytes, { locator: base.source.locator, mediaType: "video/mp4" }),
  });

  switch (change.kind) {
    case "declare-generative-tool":
      return rebuild(phoneRecording({ xmp: xmpPacket("<xmp:CreatorTool>Adobe Firefly 1.0</xmp:CreatorTool>") }));

    case "mention-tool-in-prose":
      return rebuild(
        phoneRecording({
          xmp: xmpPacket("<xmp:CreatorTool>a cut in the style people associate with Firefly</xmp:CreatorTool>"),
        }),
      );

    case "declare-mixed-tool":
      return rebuild(phoneRecording({ xmp: xmpPacket(step("Adobe Photoshop 26.0 (Generative Fill)")) }));

    case "declare-plain-editor":
      return rebuild(phoneRecording({ xmp: xmpPacket(step("Adobe Premiere Pro 25.0")) }));

    case "declare-source-type":
      return rebuild(
        phoneRecording({
          xmp: xmpPacket(
            `<Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/${change.value}</Iptc4xmpExt:DigitalSourceType>`,
          ),
        }),
      );

    case "hand-edit-history":
      return rebuild(
        phoneRecording({
          xmp: xmpPacket(
            ["DaVinci Resolve 19", "Adobe Premiere Pro 25.0", "Final Cut Pro 11", "Compressor 4.7"]
              .slice(0, change.steps)
              .map(step)
              .join(""),
          ),
        }),
      );

    case "maker-note":
      // No MakerNote exists in this container family, which is why the capture-metadata
      // counter is declared inapplicable to video rather than carried and left dead.
      return rebuild(phoneRecording({}));

    case "strip-capture-metadata":
      return rebuild(phoneRecording({ udta: { "©too": "17.5.1" } }));

    case "encoder":
      return rebuild(phoneRecording({ udta: { ...BASE_UDTA, "©too": change.value } }));

    case "content-credential": {
      if (change.state === "none") return rebuild(phoneRecording({}));
      const withBox = rebuild(phoneRecording({ c2paBox: true }));
      if (change.state === "unverified") return withBox;
      const record = verifiedManifest(withBox.c2pa.locator ?? "iso-bmff:c2pa", withBox.c2pa.byteLength, {
        claimGenerator: change.claimGenerator,
        actions: [{ action: "c2pa.created", digitalSourceType: change.digitalSourceType }],
        assertionLabels: ["c2pa.actions"],
        hasIngredients: false,
      });
      return recompute({ ...withBox, c2pa: record });
    }

    case "watermark": {
      const watermarks: readonly WatermarkProbe[] =
        change.detector === null
          ? DEFAULT_WATERMARK_PROBES
          : [
              {
                scheme: "synthid",
                outcome: "present",
                detector: change.detector,
                locator: "whole file",
                note: "reported by an external detector supplied by the caller",
              },
              ...DEFAULT_WATERMARK_PROBES.filter((p) => p.scheme !== "synthid"),
            ];
      return recompute({ ...base, watermarks });
    }
  }
}

function recompute(artifact: VideoArtifact): VideoArtifact {
  const laundering = assessLaundering(artifact.container, artifact.metadata, artifact.c2pa);
  const probes = mediaProbes(artifact.container, artifact.metadata, artifact.c2pa, artifact.watermarks, laundering);
  return withTrackProbe({ ...artifact, laundering, probes });
}

/** Attach a measurement from an external measurer. The only way the desync rule can fire. */
export function withStreamMeasurement(
  artifact: VideoArtifact,
  offsetMs: number,
  measuredBy: string,
  note = "supplied by the caller; this build does not decode video",
): VideoArtifact {
  return withTrackProbe({
    ...artifact,
    streams: { ...artifact.streams, audioVideoOffsetMs: offsetMs, measuredBy, note },
  });
}
