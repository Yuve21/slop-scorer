/**
 * MPEG-1/2 audio (MP3), and the two headers that make it interesting.
 *
 *  - ID3v2 `TSSE` ("software/hardware settings used for encoding") is a declared writer.
 *  - The Xing/Info frame carries a 9-byte LAME tag naming the encoder VERSION. That is the
 *    strongest deterministic encoder fingerprint in any container this package reads: it is
 *    written by the encoder, into a defined field, and it says exactly which build produced
 *    the bytes.
 *
 * A re-encode of an MP3 replaces this header. So a file whose ID3 says one thing and whose
 * LAME tag says another has been through two encoders, and that is an observation about the
 * FILE, not about anybody.
 */

import { at, clip, latin1, Reader, TruncatedError, utf8 } from "./bytes.js";
import type { ContainerRecord, EncoderRecord, MetadataPayload, SegmentRecord } from "./types.js";

const BITRATES_V1L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const SAMPLE_RATES = [44100, 48000, 32000, 0];

export function parseMpegAudio(bytes: Uint8Array): ContainerRecord {
  const segments: SegmentRecord[] = [];
  const payloads: MetadataPayload[] = [];
  const parseErrors: string[] = [];
  const id3Fields: Record<string, string> = {};
  let encoder: EncoderRecord | null = null;
  let sampleRate: number | undefined;
  let channels: number | undefined;
  let bitrateKbps: number | undefined;
  let cursor = 0;

  try {
    if (latin1(bytes.subarray(0, 3)) === "ID3") {
      const size = syncSafe(bytes, 6);
      const end = Math.min(bytes.length, 10 + size);
      segments.push({ name: "ID3v2", offset: 0, length: end, summary: `${size} bytes of tag` });
      readId3Frames(bytes.subarray(10, end), id3Fields, parseErrors);
      payloads.push({ kind: "id3", offset: 0, length: end, text: "", fields: id3Fields });
      const tsse = id3Fields["TSSE"];
      if (tsse) encoder = { field: "ID3v2:TSSE", value: tsse, offset: 0 };
      cursor = end;
    }

    // Find the first frame sync.
    while (cursor + 4 <= bytes.length) {
      if (bytes[cursor] === 0xff && (bytes[cursor + 1]! & 0xe0) === 0xe0) break;
      cursor += 1;
    }
    if (cursor + 4 > bytes.length) {
      parseErrors.push("no MPEG audio frame sync was found");
    } else {
      const h1 = bytes[cursor + 1]!;
      const h2 = bytes[cursor + 2]!;
      const h3 = bytes[cursor + 3]!;
      const version = (h1 >> 3) & 0x03; // 3 = MPEG-1
      const layer = (h1 >> 1) & 0x03; // 1 = layer III
      bitrateKbps = BITRATES_V1L3[(h2 >> 4) & 0x0f];
      sampleRate = SAMPLE_RATES[(h2 >> 2) & 0x03];
      channels = ((h3 >> 6) & 0x03) === 3 ? 1 : 2;
      segments.push({
        name: "frame",
        offset: cursor,
        length: 4,
        summary: `MPEG-${version === 3 ? 1 : 2} layer ${4 - layer}, ${bitrateKbps} kbps, ${sampleRate} Hz, ${channels} ch`,
      });

      // The Xing/Info tag sits inside the first frame, at a side-info offset that depends on
      // version and channel mode. Search the frame rather than compute it: the offsets are
      // fixed, few, and a miscomputed one would silently report "no LAME tag".
      const frameEnd = Math.min(bytes.length, cursor + 1_600);
      for (const tag of ["Xing", "Info"]) {
        const idx = indexOf(bytes, tag, cursor, frameEnd);
        if (idx < 0) continue;
        segments.push({ name: tag, offset: idx, length: 4, summary: "VBR/CBR header frame" });
        const lame = readLameTag(bytes, idx);
        if (lame) {
          segments.push({ name: "LAME", offset: lame.offset, length: 9, summary: lame.value });
          if (!encoder) encoder = { field: "LAME", value: lame.value, offset: lame.offset };
          else if (!sameWriter(encoder.value, lame.value)) {
            payloads.push({
              kind: "id3",
              offset: lame.offset,
              length: 9,
              text: "",
              fields: { conflictingEncoder: lame.value, declaredEncoder: encoder.value },
            });
          }
        }
        break;
      }
    }
  } catch (err) {
    parseErrors.push(err instanceof TruncatedError ? err.message : String(err));
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
      parseErrors: ["not MPEG audio: no ID3 header and no frame sync", ...parseErrors],
    };
  }

  return {
    format: "mpeg-audio",
    byteLength: bytes.length,
    segments,
    encoder,
    shape: {
      ...(sampleRate ? { sampleRate } : {}),
      ...(channels ? { channels } : {}),
      codec: `mpeg-1 layer 3${bitrateKbps ? ` ${bitrateKbps} kbps` : ""}`,
    },
    jpeg: null,
    payloads,
    parseErrors,
  };
}

/**
 * ARE THESE TWO WRITER STRINGS THE SAME WRITER, TRUNCATED DIFFERENTLY?
 *
 * Found by running this parser over real files rather than over fixtures, and it was a live
 * false positive in the strongest indicator the whole gate has.
 *
 * The field after a Xing/Info header is NINE BYTES. A writer whose name is longer than nine
 * characters is therefore cut off in it while appearing in full in the ID3 tag, so the same
 * library shows up as two different strings in one file. `Lavf60.16.101` in ID3:TSSE against
 * `Lavf` in the Info frame is one encoder named twice — and every mp3 a speech-synthesis API
 * returns looks exactly like that, because those services mux their delivery with libavformat.
 * Comparing the two strings for inequality reported `encoder_chain_conflict` at weight 1.1 on
 * all of them, which closed the re-encoding gate over a conflict that did not exist.
 *
 * The fix is a PREFIX comparison in either direction, which is what "truncated to nine bytes"
 * actually means, and it keeps the real case intact: `ElevenLabs` in the tag against
 * `LAME3.100` in the frame is neither a prefix of the other and is still a conflict.
 *
 * Case-insensitive, because the two headers are written by different code paths in the same
 * library and neither promises a casing. Whitespace-trimmed for the same reason.
 */
export function sameWriter(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (x.length === 0 || y.length === 0) return false;
  // A one- or two-character "prefix" is a coincidence rather than a truncation, and treating
  // it as a match would quietly disarm the conflict check for short names.
  const shorter = x.length <= y.length ? x : y;
  if (shorter.length < 3) return x === y;
  return x.startsWith(y) || y.startsWith(x);
}

/** The nine ASCII bytes immediately after a Xing/Info tag, when they look like a version. */
function readLameTag(bytes: Uint8Array, xingOffset: number): { value: string; offset: number } | null {
  // Xing header: "Xing" + flags(4) + optional frames(4) + bytes(4) + toc(100) + quality(4).
  const flags = ((bytes[xingOffset + 4]! << 24) | (bytes[xingOffset + 5]! << 16) | (bytes[xingOffset + 6]! << 8) | bytes[xingOffset + 7]!) >>> 0;
  let p = xingOffset + 8;
  if (flags & 0x01) p += 4;
  if (flags & 0x02) p += 4;
  if (flags & 0x04) p += 100;
  if (flags & 0x08) p += 4;
  if (p + 9 > bytes.length) return null;
  const value = latin1(bytes.subarray(p, p + 9)).replace(/\0+$/, "").trim();
  return /^[\x20-\x7e]{4,9}$/.test(value) ? { value, offset: p } : null;
}

function indexOf(bytes: Uint8Array, needle: string, from: number, to: number): number {
  outer: for (let i = from; i + needle.length <= to; i += 1) {
    for (let j = 0; j < needle.length; j += 1) if (bytes[i + j] !== needle.charCodeAt(j)) continue outer;
    return i;
  }
  return -1;
}

const syncSafe = (bytes: Uint8Array, offset: number): number =>
  ((bytes[offset]! & 0x7f) << 21) | ((bytes[offset + 1]! & 0x7f) << 14) | ((bytes[offset + 2]! & 0x7f) << 7) | (bytes[offset + 3]! & 0x7f);

function readId3Frames(body: Uint8Array, out: Record<string, string>, parseErrors: string[]): void {
  const r = new Reader(body);
  try {
    while (r.remaining >= 10) {
      const id = r.ascii(4);
      if (!/^[A-Z0-9]{4}$/.test(id)) break; // padding
      const size = r.u32be();
      r.skip(2); // flags
      if (!r.has(size) || size === 0) break;
      const raw = r.take(size);
      const encoding = raw[0];
      const text = encoding === 0 ? latin1(raw.subarray(1)) : utf8(raw.subarray(1));
      out[id] = clip(text.replace(/\0+/g, " ").trim(), 200);
    }
  } catch (err) {
    parseErrors.push(`ID3 frame walk stopped: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export const idPrefix = at;
