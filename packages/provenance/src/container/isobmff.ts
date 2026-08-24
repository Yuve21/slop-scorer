/**
 * ISO base media file format: MP4, M4A, MOV, HEIF, AVIF.
 *
 * The box tree is where a video says who wrote it. Three fields carry almost all of the
 * provenance signal and all three are declarations, not inferences:
 *
 *  - `ftyp` brands. A camera writes its own brand set; a transcoder writes `isom`/`mp42`.
 *  - `moov/udta/©too` (and `©swr`, `©mak`, `©mod`). The QuickTime writer tag. Every
 *    ffmpeg-family transcode leaves "Lavf<version>" here, which is the single most useful
 *    laundering fingerprint in the whole package, because every platform transcode is one.
 *  - `moov/udta/uuid` and `meta/c2pa`. Where a Content Credential rides in an MP4.
 *
 * The box walk is bounded by depth and by count. A malformed file must produce a parse error
 * and a lower coverage, never a hang and never a suspicion.
 */

import { at, clip, latin1, Reader, TruncatedError, utf8 } from "./bytes.js";
import type { ContainerRecord, EncoderRecord, MetadataPayload, SegmentRecord } from "./types.js";

/** Boxes whose payload is a list of child boxes. */
const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "udta", "meta", "ilst", "edts", "moof", "traf"]);

/** QuickTime metadata atoms that name a writer or a device, and what they mean. */
const WRITER_ATOMS: Readonly<Record<string, string>> = {
  "©too": "encoding tool",
  "©swr": "software",
  "©mak": "make",
  "©mod": "model",
  "©nam": "name",
  "©cmt": "comment",
};

const MAX_DEPTH = 6;
const MAX_BOXES = 4_000;

export function parseIsoBmff(bytes: Uint8Array): ContainerRecord {
  const segments: SegmentRecord[] = [];
  const payloads: MetadataPayload[] = [];
  const parseErrors: string[] = [];
  const udtaFields: Record<string, string> = {};
  let encoder: EncoderRecord | null = null;
  let brands: string[] = [];
  let timescale: number | undefined;
  let durationSeconds: number | undefined;
  let width: number | undefined;
  let height: number | undefined;
  let codec: string | undefined;
  let sampleRate: number | undefined;
  let channels: number | undefined;
  let boxCount = 0;

  const walk = (start: number, end: number, depth: number, path: string): void => {
    const r = new Reader(bytes, start);
    while (r.pos + 8 <= end) {
      if (boxCount > MAX_BOXES) {
        parseErrors.push(`stopped after ${MAX_BOXES} boxes; the tree is deeper than this parser will walk`);
        return;
      }
      boxCount += 1;
      const offset = r.pos;
      let size = r.u32be();
      const type = r.ascii(4);
      let headerSize = 8;
      if (size === 1) {
        // 64-bit size. Read as two 32-bit halves; a file larger than 2^53 bytes does not exist.
        const hi = r.u32be();
        const lo = r.u32be();
        size = hi * 2 ** 32 + lo;
        headerSize = 16;
      } else if (size === 0) {
        size = end - offset;
      }
      if (size < headerSize || offset + size > end) {
        parseErrors.push(`box "${type}" at ${at(offset)} declares ${size} bytes, which does not fit`);
        return;
      }
      const bodyStart = offset + headerSize;
      const bodyEnd = offset + size;
      const name = path ? `${path}/${type}` : type;

      if (type === "ftyp") {
        const body = bytes.subarray(bodyStart, bodyEnd);
        brands = [];
        for (let i = 0; i + 4 <= body.length; i += 4) {
          if (i === 4) continue; // minor version
          brands.push(latin1(body.subarray(i, i + 4)).trim());
        }
      }

      if (type === "mvhd") {
        const b = new Reader(bytes, bodyStart);
        const version = b.u8();
        b.skip(3);
        if (version === 1) {
          b.skip(16);
          timescale = b.u32be();
          const durHi = b.u32be();
          const durLo = b.u32be();
          durationSeconds = timescale ? (durHi * 2 ** 32 + durLo) / timescale : undefined;
        } else {
          b.skip(8);
          timescale = b.u32be();
          const dur = b.u32be();
          durationSeconds = timescale ? dur / timescale : undefined;
        }
      }

      if (type === "stsd") {
        const b = new Reader(bytes, bodyStart + 8);
        if (b.has(8)) {
          b.skip(4);
          codec = b.ascii(4);
          // Visual sample entries carry width/height at a fixed offset; audio ones carry
          // channel count and sample rate. Both are 8 bytes of reserved + 2 data reference.
          if (/^(avc1|hvc1|hev1|av01|mp4v|vp09)$/.test(codec) && b.has(70)) {
            // SampleEntry: 6 reserved + 2 data_reference_index. VisualSampleEntry then adds
            // 2 pre_defined + 2 reserved + 12 pre_defined before width and height.
            b.skip(6 + 2 + 2 + 2 + 12);
            width = b.u16be();
            height = b.u16be();
          } else if (/^(mp4a|alac|Opus|\.mp3)$/.test(codec) && b.has(20)) {
            b.skip(8 + 2 + 2 + 2 + 2);
            channels = b.u16be();
            b.skip(2 + 2 + 2);
            sampleRate = b.u32be() >>> 16;
          }
        }
      }

      const writerKind = WRITER_ATOMS[type];
      if (writerKind) {
        // QuickTime free-form atoms are `size type [data...]`; iTunes-style are wrapped in
        // a `data` child. Handle both by looking for a `data` box and falling back to raw.
        const body = bytes.subarray(bodyStart, bodyEnd);
        let value = "";
        if (body.length > 8 && latin1(body.subarray(4, 8)) === "data") {
          value = utf8(body.subarray(16));
        } else if (body.length > 4) {
          value = utf8(body.subarray(4)).replace(/^\0+/, "");
        }
        value = value.replace(/\0+$/, "").trim();
        if (value) {
          udtaFields[writerKind] = value;
          if ((type === "©too" || type === "©swr") && !encoder) {
            encoder = { field: `ISO-BMFF:${type}`, value, offset };
          }
        }
      }

      if (type === "uuid" || type === "c2pa" || type === "jumb") {
        const body = bytes.subarray(bodyStart, bodyEnd);
        if (type === "c2pa" || type === "jumb" || latin1(body.subarray(0, 4)) === "c2pa") {
          payloads.push({ kind: "c2pa", offset, length: size, text: latin1(body), fields: {} });
        }
      }

      if (type === "XMP_" || (type === "uuid" && latin1(bytes.subarray(bodyStart, bodyStart + 4)) === "\xbe\x7a\xcf\xcb")) {
        payloads.push({ kind: "xmp", offset, length: size, text: utf8(bytes.subarray(bodyStart, bodyEnd)), fields: {} });
      }

      segments.push({
        name,
        offset,
        length: size,
        summary:
          type === "ftyp"
            ? brands.join(" ")
            : writerKind
              ? clip(udtaFields[writerKind] ?? "", 60)
              : `${size} bytes`,
      });

      if (CONTAINERS.has(type) && depth < MAX_DEPTH) {
        // `meta` is a full box: one version/flags word before its children.
        const childStart = type === "meta" ? bodyStart + 4 : bodyStart;
        walk(childStart, bodyEnd, depth + 1, name);
      }

      r.seek(bodyEnd);
    }
  };

  try {
    walk(0, bytes.length, 0, "");
  } catch (err) {
    parseErrors.push(err instanceof TruncatedError ? err.message : String(err));
  }

  if (Object.keys(udtaFields).length > 0) {
    payloads.push({
      kind: "quicktime-udta",
      offset: segments.find((s) => s.name.endsWith("/udta"))?.offset ?? 0,
      length: 0,
      text: "",
      fields: udtaFields,
    });
  }

  if (segments.length === 0) {
    return {
      format: "unknown",
      byteLength: bytes.length,
      segments: [],
      encoder: null,
      shape: {},
      jpeg: null,
      payloads: [],
      parseErrors: ["not an ISO base media file: no readable box at offset 0", ...parseErrors],
    };
  }

  return {
    format: "iso-bmff",
    byteLength: bytes.length,
    segments,
    encoder,
    shape: {
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      ...(timescale !== undefined ? { timescale } : {}),
      ...(sampleRate !== undefined ? { sampleRate } : {}),
      ...(channels !== undefined ? { channels } : {}),
      ...(codec !== undefined ? { codec } : {}),
      brands,
    },
    jpeg: null,
    payloads,
    parseErrors,
  };
}
