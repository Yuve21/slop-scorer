/**
 * The media artifact: everything the ingest observed, and nothing else.
 *
 * Same two properties as the web and code artifacts, for the same reasons.
 *
 * 1. EVERY OBSERVATION CARRIES A BYTE OFFSET. There is no field in here a finding could cite
 *    vaguely. "The metadata looks synthetic" is not expressible; "jpeg:0x00000014, EXIF
 *    Software = Adobe Firefly 1.0" is. The type makes the vague version impossible to write.
 * 2. THE ARTIFACT IS THE STORED THING, NOT THE MEDIA. A few kilobytes of parsed structure is
 *    re-scorable against a later corpus with none of the storage cost, none of the copyright
 *    exposure and none of the privacy exposure of keeping somebody's photograph. The pixels
 *    and the samples are never retained: this package never reads them in the first place.
 */

import type { ProbeStatus } from "@slop/core";
import { inspectContainer } from "./container/index.js";
import type { ContainerRecord } from "./container/types.js";
import { at } from "./container/bytes.js";
import { locatedManifest, NO_MANIFEST } from "./c2pa.js";
import type { C2paRecord } from "./c2pa.js";
import { readMetadata } from "./metadata.js";
import type { MetadataRecord } from "./metadata.js";
import { assessLaundering } from "./reencode.js";
import type { LaunderingRecord } from "./reencode.js";
import { DEFAULT_WATERMARK_PROBES } from "./watermark.js";
import type { WatermarkProbe } from "./watermark.js";
import { synthJpeg } from "./fixtures/synth.js";

export const MEDIA_ARTIFACT_SCHEMA_VERSION = 1 as const;

export type MediaModality = "image" | "video" | "audio";

/**
 * Probes shared by all three media modalities.
 *
 * A modality may add its own; it may not remove one of these, because coverage has to mean
 * the same thing across a multi-modal report.
 */
export type MediaProbeId = "container" | "metadata" | "content-credential" | "watermark" | "laundering";

export const MEDIA_PROBE_WEIGHTS: Readonly<Record<MediaProbeId, number>> = {
  container: 3,
  metadata: 3,
  "content-credential": 2,
  watermark: 1,
  laundering: 3,
};

/**
 * How the bytes reached us, recorded because it changes what we are entitled to say.
 *
 * `permitted-url` is narrow on purpose. See `detectors-video`'s README: a platform URL is a
 * typed refusal, not a scraping problem to solve.
 */
export interface MediaSourceRecord {
  readonly kind: "user-file" | "permitted-url" | "replay";
  readonly locator: string;
  readonly mediaType: string | null;
  readonly byteLength: number;
}

export interface MediaArtifact {
  readonly schemaVersion: typeof MEDIA_ARTIFACT_SCHEMA_VERSION;
  readonly modality: MediaModality;
  readonly source: MediaSourceRecord;
  readonly capturedAt: string;
  readonly container: ContainerRecord;
  readonly metadata: MetadataRecord;
  readonly c2pa: C2paRecord;
  readonly watermarks: readonly WatermarkProbe[];
  readonly laundering: LaunderingRecord;
  readonly probes: readonly ProbeStatus[];
}

export interface IngestOptions {
  readonly modality: MediaModality;
  readonly locator: string;
  readonly mediaType?: string | null;
  readonly sourceKind?: MediaSourceRecord["kind"];
  readonly capturedAt?: string;
  /**
   * A verified C2PA record from a real validator, when the caller ran one. Without it the
   * ingest can only report that a manifest box exists, which is all it honestly knows.
   */
  readonly verifiedC2pa?: C2paRecord;
  /** Watermark results from scheme owners' detectors, when a caller has any. */
  readonly watermarks?: readonly WatermarkProbe[];
}

/**
 * Bytes in, artifact out. Pure, synchronous, no network, no model, no pixels.
 */
export function ingestMedia(bytes: Uint8Array, options: IngestOptions): MediaArtifact {
  const container = inspectContainer(bytes);
  const metadata = readMetadata(container);

  const c2paPayload = container.payloads.find((p) => p.kind === "c2pa");
  const located = c2paPayload
    ? locatedManifest(`${container.format}:${at(c2paPayload.offset)}`, c2paPayload.length)
    : NO_MANIFEST;
  // A caller's verifier overrides, in one direction only: it may upgrade a located box to
  // verified or invalid. It may not conjure a manifest where the container has no box.
  const c2pa = options.verifiedC2pa && c2paPayload ? options.verifiedC2pa : located;

  const watermarks = options.watermarks ?? DEFAULT_WATERMARK_PROBES;
  const laundering = assessLaundering(container, metadata, c2pa);

  return {
    schemaVersion: MEDIA_ARTIFACT_SCHEMA_VERSION,
    modality: options.modality,
    source: {
      kind: options.sourceKind ?? "user-file",
      locator: options.locator,
      mediaType: options.mediaType ?? null,
      byteLength: bytes.length,
    },
    capturedAt: options.capturedAt ?? "1970-01-01T00:00:00.000Z",
    container,
    metadata,
    c2pa,
    watermarks,
    laundering,
    probes: mediaProbes(container, metadata, c2pa, watermarks, laundering),
  };
}

/**
 * Probe statuses, and the one judgement call in this file.
 *
 * `metadata` and `laundering` declare `expectsNonEmpty: false`, deliberately. A file with no
 * metadata is the ORDINARY case, and a file with no laundering indicator is the good case.
 * Marking either as expecting content would turn a clean original into a vacuous-probe error
 * and abstain on exactly the artifacts we can read best.
 *
 * `container` and `watermark` do expect content, and that is where the vacuous-scan guard
 * actually earns its place: a container walk that produced zero segments means the parser
 * failed, and every "nothing declared here" conclusion below it was reached without looking.
 */
export function mediaProbes(
  container: ContainerRecord,
  metadata: MetadataRecord,
  c2pa: C2paRecord,
  watermarks: readonly WatermarkProbe[],
  laundering: LaunderingRecord,
): ProbeStatus[] {
  return [
    {
      id: "container",
      ran: true,
      denominator: container.segments.length,
      expectsNonEmpty: true,
      weight: MEDIA_PROBE_WEIGHTS.container,
      note: "container segments walked. Zero means the format was not recognised or the parse died at byte one, and every declaration we did not find was not found because we did not look.",
    },
    {
      id: "metadata",
      ran: true,
      denominator: metadata.fields.length,
      expectsNonEmpty: false,
      weight: MEDIA_PROBE_WEIGHTS.metadata,
      note: "metadata fields read. Zero is ordinary: most files carry none.",
    },
    {
      id: "content-credential",
      ran: true,
      denominator: c2pa.state === "absent" ? 0 : 1,
      expectsNonEmpty: false,
      weight: MEDIA_PROBE_WEIGHTS["content-credential"],
      note: "Content Credential boxes located. Zero is the overwhelmingly common case and is not evidence of anything.",
    },
    {
      id: "watermark",
      ran: true,
      denominator: watermarks.length,
      expectsNonEmpty: true,
      weight: MEDIA_PROBE_WEIGHTS.watermark,
      note: "watermark schemes considered. Zero means the probe list itself is empty, so the report would silently look as though schemes had been checked.",
    },
    {
      id: "laundering",
      ran: true,
      denominator: laundering.indicators.length + laundering.pristine.length,
      expectsNonEmpty: false,
      weight: MEDIA_PROBE_WEIGHTS.laundering,
      note: "re-encoding indicators and pristine markers weighed. Zero of both is a file we could say nothing about either way.",
    },
  ];
}

/**
 * The neutral artifact that NO rule fires on: a camera original with nothing declared.
 *
 * It is built from real bytes through the real ingest, so a parser regression breaks it
 * rather than being agreed with by a hand-written literal. EXIF names a make, a model and a
 * capture time; the quantisation table is bespoke rather than on the libjpeg ladder; there is
 * no Content Credential, no XMP, no tool declaration and no watermark result. It is not
 * laundered, so the gate is open and every rule is evaluated against it.
 *
 * It carries NO MakerNote, and that omission is deliberate rather than an oversight. The
 * capture-metadata counter rule needs all four camera fields, so a neutral artifact with a
 * MakerNote would trip a counter and the meta-suite's neutral-silence check would be
 * measuring the fixture instead of the rules. The neutral case is built one field short of
 * firing anything, in either direction.
 */
export function neutralMedia(overrides: Partial<MediaArtifact> = {}): MediaArtifact {
  const bytes = synthJpeg({
    width: 4032,
    height: 3024,
    quant: "camera",
    exif: {
      Make: "NIKON CORPORATION",
      Model: "NIKON Z 6_2",
      DateTimeOriginal: "2021:06:14 08:41:02",
      DateTime: "2021:06:14 08:41:02",
    },
  });
  const base = ingestMedia(bytes, {
    modality: "image",
    locator: "fixture://neutral.jpg",
    mediaType: "image/jpeg",
    capturedAt: "2026-08-23T00:00:00.000Z",
  });
  return { ...base, ...overrides };
}

/** Replay guard, mirroring the code detector's. A schema drift must re-ingest, not replay. */
export function asMediaArtifact(value: unknown, detectorId: string): MediaArtifact {
  if (!value || typeof value !== "object") throw new Error(`${detectorId}: replay input is not an object.`);
  const v = value as { schemaVersion?: unknown; probes?: unknown };
  if (v.schemaVersion !== MEDIA_ARTIFACT_SCHEMA_VERSION) {
    throw new Error(
      `${detectorId}: stored artifact is schema v${String(v.schemaVersion)}, this build reads v${MEDIA_ARTIFACT_SCHEMA_VERSION}. Re-ingest rather than replay.`,
    );
  }
  if (!Array.isArray(v.probes) || v.probes.length === 0) {
    throw new Error(`${detectorId}: stored artifact has no probe statuses, so its coverage cannot be established.`);
  }
  return value as MediaArtifact;
}
