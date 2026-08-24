/**
 * The image artifact, and the fixture kit that builds real image files for the shared corpus.
 *
 * The image modality adds no probes of its own: a still image has a container, metadata, a
 * Content Credential slot, a watermark slot and a laundering assessment, and there is nothing
 * else about it this product is willing to read. That is a short list on purpose.
 */

import type { ProbeStatus } from "@slop/core";
import {
  assessLaundering,
  ingestMedia,
  MEDIA_PROBE_WEIGHTS,
  mediaProbes,
  verifiedManifest,
  synthJpeg,
  synthPng,
} from "@slop/provenance";
import type { FixtureChange, MediaArtifact, MediaProbeId, WatermarkProbe } from "@slop/provenance";
import { DEFAULT_WATERMARK_PROBES } from "@slop/provenance";

export interface ImageArtifact extends MediaArtifact {
  readonly modality: "image";
}

export type ImageProbeId = MediaProbeId;

export const IMAGE_PROBE_WEIGHTS: Readonly<Record<ImageProbeId, number>> = MEDIA_PROBE_WEIGHTS;

export interface IngestImageOptions {
  readonly locator: string;
  readonly mediaType?: string | null;
  readonly capturedAt?: string;
  readonly watermarks?: readonly WatermarkProbe[];
}

export function ingestImage(bytes: Uint8Array, options: IngestImageOptions): ImageArtifact {
  return ingestMedia(bytes, { ...options, modality: "image" }) as ImageArtifact;
}

/**
 * The camera original every image fixture is a variation of.
 *
 * Real JPEG bytes: a bespoke quantisation table (not on the libjpeg ladder), EXIF naming a
 * make, a model and a capture time, no JFIF header, no MakerNote, no XMP, no Content
 * Credential. Nothing fires on it in either direction and the re-encoding gate stays open.
 */
const BASE_EXIF: Readonly<Record<string, string>> = {
  Make: "NIKON CORPORATION",
  Model: "NIKON Z 6_2",
  DateTimeOriginal: "2021:06:14 08:41:02",
  DateTime: "2021:06:14 08:41:02",
};

export function neutralImage(overrides: Partial<ImageArtifact> = {}): ImageArtifact {
  const bytes = synthJpeg({ width: 4032, height: 3024, quant: "camera", exif: BASE_EXIF });
  const base = ingestImage(bytes, {
    locator: "fixture://neutral.jpg",
    mediaType: "image/jpeg",
    capturedAt: "2026-08-23T00:00:00.000Z",
  });
  return { ...base, ...overrides };
}

/** Wrap an XMP property value in a packet the JPEG APP1 reader will actually parse. */
const xmpPacket = (body: string): string =>
  `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/">` +
  `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:xmp="http://ns.adobe.com/xap/1.0/" ` +
  `xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/" xmlns:stEvt="http://ns.adobe.com/xap/1.0/sType/ResourceEvent#" ` +
  `xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"><rdf:Description>${body}` +
  `</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;

const step = (agent: string): string => `<stEvt:softwareAgent>${agent}</stEvt:softwareAgent>`;

const HAND_EDIT_AGENTS = ["Capture One 23", "Adobe Photoshop 25.9", "Affinity Photo 2.5", "Nikon NX Studio 1.6"];

/**
 * Realise a semantic fixture change as real image bytes.
 *
 * Every branch re-encodes a whole file and re-runs the real ingest. Nothing patches a parsed
 * record, because a fixture that skipped the parser would keep passing after the parser broke
 * — which is the exact failure mode `packages/core/test/meta.ts` exists to catch, and the one
 * a byte-offset detector is most exposed to.
 *
 * The two exceptions are `verified` Content Credentials and positive watermark results. Both
 * are outputs of external verifiers this build does not ship, so there are no bytes to write:
 * they are attached to the record the way a real caller would attach them, and the laundering
 * assessment and probe statuses are recomputed afterwards so the artifact stays self-consistent.
 */
export function imageVariant(base: ImageArtifact, change: FixtureChange): ImageArtifact {
  switch (change.kind) {
    case "declare-generative-tool":
      // A PNG text chunk, because that is where local generation tools actually write.
      return fromPng(base, {
        parameters:
          "a wide shot of a harbour at dawn\nSteps: 28, Sampler: DPM++ 2M Karras, CFG scale: 7, Seed: 1284471096, Model hash: 6ce0161689",
      });

    case "mention-tool-in-prose":
      return fromPng(base, { Description: "a study in the style people associate with Midjourney and Firefly" });

    case "declare-mixed-tool":
      return fromJpeg(base, { xmp: xmpPacket(step("Adobe Photoshop 26.0 (Generative Fill)")) });

    case "declare-plain-editor":
      return fromJpeg(base, { xmp: xmpPacket(step("Adobe Photoshop 26.0")) });

    case "declare-source-type":
      return fromJpeg(base, {
        xmp: xmpPacket(
          `<Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/${change.value}</Iptc4xmpExt:DigitalSourceType>`,
        ),
      });

    case "hand-edit-history":
      return fromJpeg(base, {
        xmp: xmpPacket(HAND_EDIT_AGENTS.slice(0, change.steps).map(step).join("")),
      });

    case "maker-note":
      return fromJpeg(base, change.present ? { makerNoteBytes: 640 } : {});

    case "strip-capture-metadata":
      return fromJpeg(base, { exif: {} });

    case "encoder":
      return fromJpeg(base, { exif: { ...BASE_EXIF, Software: change.value } });

    case "content-credential": {
      if (change.state === "none") return fromJpeg(base, {});
      const withBox = fromJpeg(base, { c2paBox: true });
      if (change.state === "unverified") return withBox;
      const record = verifiedManifest(withBox.c2pa.locator ?? "jpeg:c2pa", withBox.c2pa.byteLength, {
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

type JpegOverrides = {
  exif?: Readonly<Record<string, string>>;
  makerNoteBytes?: number;
  xmp?: string;
  c2paBox?: boolean;
};

function fromJpeg(base: ImageArtifact, over: JpegOverrides): ImageArtifact {
  const bytes = synthJpeg({
    width: 4032,
    height: 3024,
    quant: "camera",
    exif: over.exif ?? BASE_EXIF,
    ...(over.makerNoteBytes ? { makerNoteBytes: over.makerNoteBytes } : {}),
    ...(over.xmp ? { xmp: over.xmp } : {}),
    ...(over.c2paBox ? { c2paBox: true } : {}),
  });
  return { ...base, ...ingestImage(bytes, { locator: base.source.locator, mediaType: "image/jpeg" }) };
}

function fromPng(base: ImageArtifact, text: Readonly<Record<string, string>>): ImageArtifact {
  const bytes = synthPng({ width: 1024, height: 1024, text });
  return { ...base, ...ingestImage(bytes, { locator: base.source.locator, mediaType: "image/png" }) };
}

/**
 * Recompute the derived records after a verifier's result was attached.
 *
 * The laundering assessment reads the Content Credential state, so attaching one without
 * recomputing would leave an artifact whose gate disagreed with its own manifest.
 */
function recompute(artifact: ImageArtifact): ImageArtifact {
  const laundering = assessLaundering(artifact.container, artifact.metadata, artifact.c2pa);
  const probes: readonly ProbeStatus[] = mediaProbes(
    artifact.container,
    artifact.metadata,
    artifact.c2pa,
    artifact.watermarks,
    laundering,
  );
  return { ...artifact, laundering, probes };
}
