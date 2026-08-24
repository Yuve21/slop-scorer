/**
 * EXIF / XMP / IPTC, normalised into one record.
 *
 * Three sidecar vocabularies, one question: what did the file declare about itself? The
 * normalisation is intentionally lossy. Every field kept below is one a rule cites and can
 * point at; the rest is discarded rather than carried, because a field nobody reads is a
 * field nobody has checked.
 *
 * The IPTC `DigitalSourceType` is the field the EU AI Act's Article 50 ecosystem is
 * converging on and the only widely deployed way for a producer to SAY a model made
 * something. Reading it is the difference between this package and a guessing classifier.
 */

import { at, clip } from "./container/bytes.js";
import type { ContainerRecord, MetadataPayload } from "./container/types.js";
import { digitalSourceTypeOf } from "./c2pa.js";
import type { DigitalSourceType } from "./c2pa.js";

export interface MetadataField {
  readonly name: string;
  readonly value: string;
  /** Byte offset of the payload the value came out of. Every field is followable. */
  readonly locator: string;
  readonly vocabulary: "exif" | "xmp" | "iptc" | "png-text" | "id3" | "riff-info" | "quicktime";
}

export interface MetadataRecord {
  readonly fields: readonly MetadataField[];
  /** The IPTC digital source type, from XMP or IPTC-IIM. `unknown` when nothing declared one. */
  readonly digitalSourceType: DigitalSourceType;
  /** The locator of whatever declared `digitalSourceType`, when something did. */
  readonly digitalSourceLocator: string | null;
  /** True when a camera MakerNote block is present. Cheap to strip, impossible to forge well. */
  readonly hasMakerNote: boolean;
  /** True when EXIF carried a capture timestamp. */
  readonly hasCaptureTime: boolean;
  /** Camera make and model when EXIF declared them. */
  readonly make: string | null;
  readonly model: string | null;
  /** Every distinct software agent named anywhere, in the order found. */
  readonly softwareAgents: readonly string[];
}

export const EMPTY_METADATA: MetadataRecord = {
  fields: [],
  digitalSourceType: "unknown",
  digitalSourceLocator: null,
  hasMakerNote: false,
  hasCaptureTime: false,
  make: null,
  model: null,
  softwareAgents: [],
};

/** XMP properties worth naming, in the two namespaces that carry provenance. */
const XMP_PATTERNS: readonly { readonly name: string; readonly re: RegExp }[] = [
  { name: "DigitalSourceType", re: /(?:Iptc4xmpExt|iptcExt):DigitalSourceType\s*=\s*"([^"]+)"/ },
  { name: "DigitalSourceType", re: /<(?:Iptc4xmpExt|iptcExt):DigitalSourceType>([^<]+)</ },
  { name: "CreatorTool", re: /xmp:CreatorTool\s*=\s*"([^"]+)"/ },
  { name: "CreatorTool", re: /<xmp:CreatorTool>([^<]+)</ },
  { name: "HistorySoftwareAgent", re: /stEvt:softwareAgent\s*=\s*"([^"]+)"/ },
  { name: "HistorySoftwareAgent", re: /<stEvt:softwareAgent>([^<]+)</ },
  { name: "DocumentID", re: /xmpMM:DocumentID\s*=\s*"([^"]+)"/ },
  { name: "OriginalDocumentID", re: /xmpMM:OriginalDocumentID\s*=\s*"([^"]+)"/ },
];

/** IPTC-IIM dataset numbers that name a program. 2:65 is "Originating Program". */
const IIM_ORIGINATING_PROGRAM = 0x41;

export function readMetadata(container: ContainerRecord): MetadataRecord {
  const fields: MetadataField[] = [];
  const agents: string[] = [];
  let digitalSourceType: DigitalSourceType = "unknown";
  let digitalSourceLocator: string | null = null;
  let hasMakerNote = false;
  let hasCaptureTime = false;
  let make: string | null = null;
  let model: string | null = null;

  const push = (f: MetadataField): void => {
    fields.push(f);
    if (/software|creatortool|agent|program|encoder|tool/i.test(f.name) && f.value && !agents.includes(f.value)) {
      agents.push(f.value);
    }
  };

  for (const payload of container.payloads) {
    const locator = `${container.format}:${at(payload.offset)}`;
    if (payload.kind === "exif") {
      for (const [name, value] of Object.entries(payload.fields)) {
        push({ name, value: clip(value), locator, vocabulary: "exif" });
      }
      if (payload.fields["MakerNote"]) hasMakerNote = true;
      if (payload.fields["DateTimeOriginal"] || payload.fields["DateTime"]) hasCaptureTime = true;
      make = payload.fields["Make"] ?? make;
      model = payload.fields["Model"] ?? model;
    }

    if (payload.kind === "xmp") {
      for (const { name, re } of XMP_PATTERNS) {
        // ALL matches, not the first. An `xmpMM:History` chain has one software agent per
        // edit step, and reading only the first would turn a five-step hand-edit history into
        // a single step: the counter-evidence rule that reads it would stop firing and the
        // artifact would quietly score higher, with nothing in the output saying why.
        for (const m of payload.text.matchAll(new RegExp(re.source, `${re.flags}g`))) {
          if (!m[1]) continue;
          push({ name, value: clip(m[1]), locator, vocabulary: "xmp" });
          if (name === "DigitalSourceType" && digitalSourceType === "unknown") {
            digitalSourceType = digitalSourceTypeOf(m[1]);
            digitalSourceLocator = locator;
          }
        }
      }
    }

    if (payload.kind === "iptc-iim") {
      const value = readIimOriginatingProgram(payload);
      if (value) push({ name: "OriginatingProgram", value: clip(value), locator, vocabulary: "iptc" });
    }

    if (payload.kind === "png-text") {
      const key = payload.fields["key"];
      const value = payload.fields["value"];
      if (key && value !== undefined) push({ name: key, value: clip(value, 400), locator, vocabulary: "png-text" });
    }

    if (payload.kind === "id3") {
      for (const [name, value] of Object.entries(payload.fields)) {
        push({ name, value: clip(value), locator, vocabulary: "id3" });
      }
    }

    if (payload.kind === "riff-info") {
      for (const [name, value] of Object.entries(payload.fields)) {
        push({ name, value: clip(value), locator, vocabulary: "riff-info" });
      }
    }

    if (payload.kind === "quicktime-udta") {
      for (const [name, value] of Object.entries(payload.fields)) {
        push({ name, value: clip(value), locator, vocabulary: "quicktime" });
      }
    }
  }

  if (container.encoder) {
    const locator = `${container.format}:${at(container.encoder.offset)}`;
    if (!fields.some((f) => f.value === container.encoder!.value && f.locator === locator)) {
      push({
        name: container.encoder.field,
        value: clip(container.encoder.value),
        locator,
        vocabulary: container.format === "jpeg" ? "exif" : "riff-info",
      });
    }
  }

  return {
    fields,
    digitalSourceType,
    digitalSourceLocator,
    hasMakerNote,
    hasCaptureTime,
    make,
    model,
    softwareAgents: agents,
  };
}

/**
 * IPTC-IIM lives inside an APP13 Photoshop resource block. Rather than walk the whole 8BIM
 * structure for one dataset, scan for the four-byte record marker: 0x1C 0x02 0x41 then a
 * two-byte big-endian length. The pattern is exact and the payload is bounded.
 */
function readIimOriginatingProgram(payload: MetadataPayload): string | null {
  const text = payload.text;
  for (let i = 0; i + 5 < text.length; i += 1) {
    if (text.charCodeAt(i) !== 0x1c) continue;
    if (text.charCodeAt(i + 1) !== 0x02) continue;
    if (text.charCodeAt(i + 2) !== IIM_ORIGINATING_PROGRAM) continue;
    const length = (text.charCodeAt(i + 3) << 8) | text.charCodeAt(i + 4);
    if (length <= 0 || length > 256 || i + 5 + length > text.length) continue;
    return text.slice(i + 5, i + 5 + length);
  }
  return null;
}
