/**
 * RIFF: WAVE, and WebP's outer wrapper.
 *
 * The provenance-bearing chunk is `LIST/INFO/ISFT`, the software that wrote the file. Voice
 * synthesis services and DAWs both fill it in, and a file with a `fmt ` chunk but no `ISFT`
 * at all is the ordinary case rather than a suspicious one.
 */

import { at, clip, latin1, Reader, TruncatedError } from "./bytes.js";
import type { ContainerRecord, EncoderRecord, MetadataPayload, SegmentRecord } from "./types.js";

/** RIFF INFO keys worth naming. Everything else is recorded but not interpreted. */
const INFO_KEYS: Readonly<Record<string, string>> = {
  ISFT: "software",
  ICMT: "comment",
  INAM: "name",
  IART: "artist",
  ICRD: "created",
  IENG: "engineer",
  ITCH: "technician",
};

export function parseRiff(bytes: Uint8Array): ContainerRecord {
  const segments: SegmentRecord[] = [];
  const payloads: MetadataPayload[] = [];
  const parseErrors: string[] = [];
  const info: Record<string, string> = {};
  let encoder: EncoderRecord | null = null;
  let sampleRate: number | undefined;
  let channels: number | undefined;
  let bitDepth: number | undefined;
  let dataBytes = 0;
  let formatTag = 0;

  const r = new Reader(bytes);
  try {
    if (r.ascii(4) !== "RIFF") return notRiff(bytes.length);
    const declared = r.u32le();
    const form = r.ascii(4);
    segments.push({ name: "RIFF", offset: 0, length: declared + 8, summary: form });
    if (declared + 8 !== bytes.length) {
      parseErrors.push(`RIFF header declares ${declared + 8} bytes for a ${bytes.length}-byte file`);
    }

    while (r.remaining >= 8) {
      const offset = r.pos;
      const id = r.ascii(4);
      const size = r.u32le();
      if (!r.has(size)) {
        parseErrors.push(`chunk "${id}" at ${at(offset)} declares ${size} bytes past the end`);
        break;
      }
      const body = r.take(size);
      if (size % 2 === 1 && r.has(1)) r.skip(1); // pad byte

      if (id === "fmt " && body.length >= 16) {
        const b = new Reader(body);
        formatTag = b.u16le();
        channels = b.u16le();
        sampleRate = b.u32le();
        b.skip(6);
        bitDepth = b.u16le();
      }
      if (id === "data") dataBytes = size;

      if (id === "LIST" && latin1(body.subarray(0, 4)) === "INFO") {
        const b = new Reader(body, 4);
        while (b.remaining >= 8) {
          const key = b.ascii(4);
          const len = b.u32le();
          if (!b.has(len)) break;
          const value = latin1(b.take(len)).replace(/\0+$/, "").trim();
          if (len % 2 === 1 && b.has(1)) b.skip(1);
          const named = INFO_KEYS[key] ?? key;
          info[named] = value;
          if (key === "ISFT" && value && !encoder) {
            encoder = { field: "RIFF:LIST/INFO/ISFT", value, offset };
          }
        }
        payloads.push({ kind: "riff-info", offset, length: size, text: "", fields: info });
      }

      if (id === "C2PA" || id === "c2pa") {
        payloads.push({ kind: "c2pa", offset, length: size, text: latin1(body), fields: {} });
      }
      // `_PMX` is the standard XMP chunk in a RIFF file. Named oddly for historical reasons
      // and easy to miss, which is why it is handled here rather than assumed absent.
      if (id === "_PMX") {
        payloads.push({ kind: "xmp", offset, length: size, text: latin1(body), fields: {} });
      }
      if (id === "id3 " || id === "ID3 ") {
        payloads.push({ kind: "id3", offset, length: size, text: latin1(body), fields: {} });
      }

      segments.push({
        name: id === "LIST" ? `LIST/${latin1(body.subarray(0, 4))}` : id,
        offset,
        length: size + 8,
        summary:
          id === "fmt "
            ? `${sampleRate} Hz, ${channels} ch, ${bitDepth}-bit, format tag ${formatTag}`
            : id === "LIST"
              ? clip(Object.entries(info).map(([k, v]) => `${k}=${v}`).join("; "), 80)
              : `${size} bytes`,
      });
    }
  } catch (err) {
    parseErrors.push(err instanceof TruncatedError ? err.message : String(err));
  }

  const bytesPerSecond = ((sampleRate ?? 0) * (channels ?? 0) * (bitDepth ?? 0)) / 8;
  const durationSeconds = bytesPerSecond > 0 ? dataBytes / bytesPerSecond : undefined;

  return {
    format: "riff-wave",
    byteLength: bytes.length,
    segments,
    encoder,
    shape: {
      ...(sampleRate !== undefined ? { sampleRate } : {}),
      ...(channels !== undefined ? { channels } : {}),
      ...(bitDepth !== undefined ? { bitDepth } : {}),
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      codec: formatTag === 1 ? "pcm" : `wave format tag ${formatTag}`,
    },
    jpeg: null,
    payloads,
    parseErrors,
  };
}

const notRiff = (byteLength: number): ContainerRecord => ({
  format: "unknown",
  byteLength,
  segments: [] as SegmentRecord[],
  encoder: null as EncoderRecord | null,
  shape: {},
  jpeg: null,
  payloads: [] as MetadataPayload[],
  parseErrors: ["not a RIFF file: the first four bytes are not 'RIFF'"],
});
