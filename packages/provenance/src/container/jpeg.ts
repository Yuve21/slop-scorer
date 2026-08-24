/**
 * JPEG marker walk.
 *
 * This parser exists for one reason above all the others: `image-detection-reality.md`
 * establishes that a lossy re-encode is the transform under which every published detector
 * family collapses, and JPEG is where that transform lives. Reading the quantisation tables
 * is how we find out whether it happened, from bytes, without a classifier.
 *
 * What it does NOT do is look at a single pixel. There is no entropy decode here, no DCT, no
 * frequency analysis. The scan payload is skipped wholesale. That is a design commitment,
 * not an omission: a pixel-forensic read is exactly the thing the research says we cannot
 * defend, and code that is not written cannot be quietly enabled later.
 */

import { at, clip, indexOfAscii, latin1, Reader, TruncatedError, utf8 } from "./bytes.js";
import type { ContainerRecord, EncoderRecord, JpegRecord, MetadataPayload, SegmentRecord } from "./types.js";

/**
 * The IJG standard luminance quantisation table, from the JPEG specification Annex K.
 *
 * Every libjpeg-family encoder scales this table by an integer quality factor, so the 64
 * coefficients a file carries invert back to the quality that wrote it. Cameras that ship
 * their own tuned tables do not land on this ladder, and that is itself the signal.
 */
const IJG_LUMA: readonly number[] = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51,
  87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
];
const IJG_LUMA_SUM = IJG_LUMA.reduce((a, b) => a + b, 0);

const MARKER_NAMES: Readonly<Record<number, string>> = {
  0xd8: "SOI",
  0xd9: "EOI",
  0xda: "SOS",
  0xdb: "DQT",
  0xc4: "DHT",
  0xdd: "DRI",
  0xfe: "COM",
};

const sofName = (m: number): string | null => {
  if (m === 0xc0) return "SOF0 (baseline)";
  if (m === 0xc1) return "SOF1 (extended sequential)";
  if (m === 0xc2) return "SOF2 (progressive)";
  if (m >= 0xc3 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return `SOF${m - 0xc0}`;
  return null;
};

export function parseJpeg(bytes: Uint8Array): ContainerRecord {
  const r = new Reader(bytes);
  const segments: SegmentRecord[] = [];
  const payloads: MetadataPayload[] = [];
  const parseErrors: string[] = [];
  const quantTables: number[][] = [];
  let encoder: EncoderRecord | null = null;
  let progressive = false;
  let jfif = false;
  let width: number | undefined;
  let height: number | undefined;
  let chromaSubsampling: string | null = null;
  let trailingBytes = 0;

  try {
    if (r.u16be() !== 0xffd8) return notJpeg(bytes.length);
    segments.push({ name: "SOI", offset: 0, length: 2, summary: "start of image" });

    while (r.remaining >= 2) {
      const markerStart = r.pos;
      let b = r.u8();
      if (b !== 0xff) {
        // Fill bytes are legal between segments; anything else means we are lost.
        parseErrors.push(`unexpected byte ${at(markerStart)} where a marker was expected`);
        break;
      }
      // 0xFF may be repeated as padding before the marker code.
      while (r.has(1) && (b = r.u8()) === 0xff) {
        /* skip fill */
      }
      const marker = b;
      if (marker === 0xd9) {
        segments.push({ name: "EOI", offset: markerStart, length: 2, summary: "end of image" });
        trailingBytes = bytes.length - r.pos;
        break;
      }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        segments.push({ name: `RST/TEM ${marker.toString(16)}`, offset: markerStart, length: 2, summary: "" });
        continue;
      }
      if (!r.has(2)) {
        parseErrors.push(`marker 0x${marker.toString(16)} at ${at(markerStart)} has no length field`);
        break;
      }
      const length = r.u16be();
      const payloadStart = r.pos;
      const payloadLength = Math.max(0, length - 2);
      if (!r.has(payloadLength)) {
        parseErrors.push(`marker 0x${marker.toString(16)} at ${at(markerStart)} declares ${length} bytes past the end`);
        break;
      }
      const payload = r.take(payloadLength);

      const sof = sofName(marker);
      if (sof) {
        progressive = marker === 0xc2;
        if (payload.length >= 6) {
          height = (payload[1]! << 8) | payload[2]!;
          width = (payload[3]! << 8) | payload[4]!;
          chromaSubsampling = subsamplingOf(payload);
        }
        segments.push({
          name: sof,
          offset: markerStart,
          length: length + 2,
          summary: `${width ?? "?"}x${height ?? "?"}${chromaSubsampling ? `, ${chromaSubsampling}` : ""}`,
        });
        continue;
      }

      if (marker === 0xdb) {
        const tables = quantTables_(payload);
        for (const t of tables) quantTables.push(t);
        segments.push({
          name: "DQT",
          offset: markerStart,
          length: length + 2,
          summary: `${tables.length} table(s), sum(s) ${tables.map(sumOf).join(", ")}`,
        });
        continue;
      }

      if (marker >= 0xe0 && marker <= 0xef) {
        const appIndex = marker - 0xe0;
        const name = `APP${appIndex}`;
        const tag = latin1(payload.subarray(0, 32)).split("\0")[0] ?? "";
        segments.push({ name, offset: markerStart, length: length + 2, summary: clip(tag || `${payloadLength} bytes`, 40) });

        if (appIndex === 0 && tag === "JFIF") jfif = true;

        if (appIndex === 1 && tag === "Exif") {
          const exifStart = payloadStart + 6;
          const fields = readExifStrings(payload.subarray(6));
          payloads.push({ kind: "exif", offset: exifStart, length: payloadLength - 6, text: "", fields });
          const software = fields["Software"];
          if (software && !encoder) encoder = { field: "EXIF:Software", value: software, offset: exifStart };
        }

        if (appIndex === 1 && tag.startsWith("http://ns.adobe.com/xap")) {
          const text = utf8(payload.subarray(tag.length + 1));
          payloads.push({ kind: "xmp", offset: payloadStart, length: payloadLength, text, fields: {} });
        }

        if (appIndex === 13 && tag === "Photoshop 3.0") {
          payloads.push({
            kind: "iptc-iim",
            offset: payloadStart,
            length: payloadLength,
            text: latin1(payload),
            fields: {},
          });
        }

        // APP11 carries JUMBF, which is how a C2PA manifest rides in a JPEG.
        if (appIndex === 11 && indexOfAscii(payload, "jumb") >= 0) {
          payloads.push({
            kind: "c2pa",
            offset: payloadStart,
            length: payloadLength,
            text: latin1(payload),
            fields: {},
          });
        }
        continue;
      }

      if (marker === 0xfe) {
        const text = latin1(payload);
        segments.push({ name: "COM", offset: markerStart, length: length + 2, summary: clip(text, 60) });
        continue;
      }

      if (marker === 0xda) {
        segments.push({ name: "SOS", offset: markerStart, length: length + 2, summary: "start of scan" });
        // Skip the entropy-coded data without decoding it. We are looking for the next
        // marker that is not a restart marker or a stuffed 0xFF00.
        while (r.has(2)) {
          if (r.u8() !== 0xff) continue;
          const next = r.u8();
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) continue;
          r.skip(-2);
          break;
        }
        continue;
      }

      segments.push({
        name: MARKER_NAMES[marker] ?? `marker 0x${marker.toString(16)}`,
        offset: markerStart,
        length: length + 2,
        summary: `${payloadLength} bytes`,
      });
    }
  } catch (err) {
    parseErrors.push(err instanceof TruncatedError ? err.message : String(err));
  }

  const jpegRecord: JpegRecord = {
    progressive,
    quantTables,
    quantTableSums: quantTables.map(sumOf),
    qualityEstimate: estimateQuality(quantTables[0]),
    chromaSubsampling,
    jfif,
    trailingBytes,
  };

  return {
    format: "jpeg",
    byteLength: bytes.length,
    segments,
    encoder,
    shape: { ...(width !== undefined ? { width } : {}), ...(height !== undefined ? { height } : {}), codec: "jpeg" },
    jpeg: jpegRecord,
    payloads,
    parseErrors,
  };
}

const notJpeg = (byteLength: number): ContainerRecord => ({
  format: "unknown",
  byteLength,
  segments: [],
  encoder: null,
  shape: {},
  jpeg: null,
  payloads: [],
  parseErrors: ["not a JPEG: the first two bytes are not SOI"],
});

/** Every quantisation table in a DQT segment, as 64 coefficients in zig-zag order. */
function quantTables_(payload: Uint8Array): number[][] {
  const tables: number[][] = [];
  let i = 0;
  while (i < payload.length) {
    const pq = (payload[i]! >> 4) & 0x0f;
    const size = pq === 0 ? 64 : 128;
    i += 1;
    if (i + size > payload.length) break;
    const table: number[] = [];
    for (let k = 0; k < 64; k += 1) {
      table.push(pq === 0 ? payload[i + k]! : (payload[i + k * 2]! << 8) | payload[i + k * 2 + 1]!);
    }
    tables.push(table);
    i += size;
  }
  return tables;
}

const sumOf = (table: readonly number[]): number => table.reduce((a, b) => a + b, 0);

/**
 * The IJG quality inverse, done ELEMENTWISE rather than on the table sum.
 *
 * libjpeg scales the Annex K table by `scale = quality < 50 ? 5000/quality : 200 - 2*quality`
 * and rounds each coefficient, so the table a libjpeg-family encoder writes is a
 * deterministic function of one integer. This walks all 100 candidate qualities, regenerates
 * the reference table for each, and reports the one whose 64 bytes match.
 *
 * Doing it on the SUM alone was the first version of this function and it was wrong in the
 * dangerous direction: every positive sum inverts to some quality, so a camera's bespoke
 * table came back as "quality 85 on the standard ladder" and the re-encoding gate fired on a
 * pristine original. The elementwise check is the difference between "this sum is plausible"
 * and "these are the exact 64 bytes libjpeg writes at quality 85".
 *
 * `null` therefore means something specific and useful: whatever wrote this table was not
 * scaling the reference table, which is what a camera, a raw converter and several
 * professional encoders all do.
 */
export function estimateQuality(table: readonly number[] | undefined): number | null {
  if (!table || table.length !== 64) return null;
  let best: { quality: number; error: number } | null = null;
  for (let q = 1; q <= 100; q += 1) {
    const reference = scaledIjgTable(q);
    let error = 0;
    for (let i = 0; i < 64; i += 1) error += Math.abs(table[i]! - reference[i]!);
    if (!best || error < best.error) best = { quality: q, error };
  }
  if (!best) return null;
  // One unit of mean absolute deviation across 64 coefficients. libjpeg's own output scores
  // zero here; a bespoke table scores far higher. The tolerance exists only to absorb
  // encoders that clamp differently at the extremes.
  return best.error / 64 <= 1 ? best.quality : null;
}

/** libjpeg's `jpeg_quality_scaling` plus its rounding, exactly. */
export function scaledIjgTable(quality: number): number[] {
  const clamped = Math.min(100, Math.max(1, quality));
  const scale = clamped < 50 ? 5000 / clamped : 200 - 2 * clamped;
  return IJG_LUMA.map((v) => Math.min(255, Math.max(1, Math.floor((v * scale + 50) / 100))));
}

/** The reference sum, exported so a test can build a table at a chosen quality. */
export const IJG_LUMA_TABLE: readonly number[] = IJG_LUMA;
export const IJG_LUMA_REFERENCE_SUM = IJG_LUMA_SUM;

function subsamplingOf(sof: Uint8Array): string | null {
  const components = sof[5];
  if (!components || sof.length < 6 + components * 3) return null;
  const factors: [number, number][] = [];
  for (let i = 0; i < components; i += 1) {
    const f = sof[6 + i * 3 + 1]!;
    factors.push([(f >> 4) & 0x0f, f & 0x0f]);
  }
  const first = factors[0];
  if (!first) return null;
  if (components === 1) return "grayscale";
  const key = `${first[0]}x${first[1]}`;
  if (key === "1x1") return "4:4:4";
  if (key === "2x1") return "4:2:2";
  if (key === "2x2") return "4:2:0";
  return `factors ${factors.map(([h, v]) => `${h}x${v}`).join(",")}`;
}

/**
 * A deliberately small EXIF reader: the ASCII tags that matter for provenance, and nothing
 * else. Make, Model, Software, DateTimeOriginal, plus whether a MakerNote exists at all.
 *
 * A full EXIF library would read hundreds of tags we have no rule for, and every one of them
 * would be an unexercised code path in a package whose whole claim is that it only reports
 * what it actually read.
 */
export function readExifStrings(tiff: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  if (tiff.length < 8) return out;
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  const big = tiff[0] === 0x4d && tiff[1] === 0x4d;
  if (!little && !big) return out;
  const u16 = (o: number): number => (little ? tiff[o]! | (tiff[o + 1]! << 8) : (tiff[o]! << 8) | tiff[o + 1]!);
  const u32 = (o: number): number => (little ? (u16(o) | (u16(o + 2) << 16)) >>> 0 : ((u16(o) << 16) | u16(o + 2)) >>> 0);

  const TAGS: Readonly<Record<number, string>> = {
    0x010f: "Make",
    0x0110: "Model",
    0x0131: "Software",
    0x0132: "DateTime",
    0x9003: "DateTimeOriginal",
    0x9286: "UserComment",
    0x927c: "MakerNote",
    0xa430: "OwnerName",
    0x013b: "Artist",
    0x8298: "Copyright",
    0x8769: "ExifIFDPointer",
  };

  const walk = (ifdOffset: number, depth: number): void => {
    if (depth > 2 || ifdOffset <= 0 || ifdOffset + 2 > tiff.length) return;
    const count = u16(ifdOffset);
    if (count > 512) return;
    for (let i = 0; i < count; i += 1) {
      const entry = ifdOffset + 2 + i * 12;
      if (entry + 12 > tiff.length) return;
      const tag = u16(entry);
      const type = u16(entry + 2);
      const n = u32(entry + 4);
      const name = TAGS[tag];
      if (!name) continue;
      if (name === "ExifIFDPointer") {
        walk(u32(entry + 8), depth + 1);
        continue;
      }
      if (name === "MakerNote") {
        out["MakerNote"] = `${n} bytes`;
        continue;
      }
      if (type !== 2 || n === 0) continue; // ASCII only
      const valueOffset = n <= 4 ? entry + 8 : u32(entry + 8);
      if (valueOffset + n > tiff.length) continue;
      out[name] = latin1(tiff.subarray(valueOffset, valueOffset + n)).replace(/\0+$/, "");
    }
  };

  walk(u32(4), 0);
  return out;
}
