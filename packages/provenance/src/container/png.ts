/**
 * PNG chunk walk.
 *
 * PNG matters disproportionately here for a reason that has nothing to do with photography:
 * it is where local generation tools write their parameters in plain text. Stable Diffusion
 * web UIs put the whole prompt, sampler, seed and model hash into a `tEXt` chunk keyed
 * `parameters`; ComfyUI writes `prompt` and `workflow` as JSON. Those are DECLARED, in a
 * defined field, in the file. That is the deterministic end of this product, and it is a
 * completely different epistemic object from "the pixels look smooth".
 *
 * The chunk CRC is verified. A text chunk with a bad CRC is reported as a parse error rather
 * than read, because an unverified text chunk is a string an attacker chose.
 */

import { at, clip, latin1, Reader, TruncatedError, utf8 } from "./bytes.js";
import type { ContainerRecord, EncoderRecord, MetadataPayload, SegmentRecord } from "./types.js";

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export const PNG_SIGNATURE: readonly number[] = SIGNATURE;

export function parsePng(bytes: Uint8Array): ContainerRecord {
  const segments: SegmentRecord[] = [];
  const payloads: MetadataPayload[] = [];
  const parseErrors: string[] = [];
  const fields: Record<string, string> = {};
  let encoder: EncoderRecord | null = null;
  let width: number | undefined;
  let height: number | undefined;
  let bitDepth: number | undefined;
  let idatCount = 0;

  const r = new Reader(bytes);
  try {
    const sig = r.take(8);
    if (!SIGNATURE.every((b, i) => sig[i] === b)) {
      return {
        format: "unknown",
        byteLength: bytes.length,
        segments: [],
        encoder: null,
        shape: {},
        jpeg: null,
        payloads: [],
        parseErrors: ["not a PNG: the eight-byte signature does not match"],
      };
    }

    while (r.remaining >= 12) {
      const offset = r.pos;
      const length = r.u32be();
      if (!r.has(4 + length + 4)) {
        parseErrors.push(`chunk at ${at(offset)} declares ${length} bytes past the end of the file`);
        break;
      }
      const typeBytes = r.take(4);
      const type = latin1(typeBytes);
      const data = r.take(length);
      const declaredCrc = r.u32be();
      const actual = crc32(concat(typeBytes, data));
      if (actual !== declaredCrc) {
        parseErrors.push(
          `chunk "${type}" at ${at(offset)} fails its CRC (declared ${declaredCrc}, computed ${actual}); its contents were not read`,
        );
        continue;
      }

      if (type === "IHDR" && data.length >= 9) {
        width = ((data[0]! << 24) | (data[1]! << 16) | (data[2]! << 8) | data[3]!) >>> 0;
        height = ((data[4]! << 24) | (data[5]! << 16) | (data[6]! << 8) | data[7]!) >>> 0;
        bitDepth = data[8]!;
      }
      if (type === "IDAT") idatCount += 1;

      if (type === "tEXt" || type === "zTXt" || type === "iTXt") {
        const parsed = readTextChunk(type, data);
        if (parsed) {
          fields[parsed.key] = parsed.value;
          payloads.push({
            kind: "png-text",
            offset,
            length,
            text: parsed.value,
            fields: { key: parsed.key, value: parsed.value },
          });
          if (/^(software|creation tool|creator tool)$/i.test(parsed.key) && !encoder) {
            encoder = { field: `PNG:${parsed.key}`, value: parsed.value, offset };
          }
        } else {
          parseErrors.push(`text chunk "${type}" at ${at(offset)} was compressed and was not decompressed`);
        }
      }

      if (type === "iTXt" && /xml:com\.adobe\.xmp/i.test(latin1(data.subarray(0, 32)))) {
        payloads.push({ kind: "xmp", offset, length, text: utf8(data), fields: {} });
      }

      // caBX is the C2PA box in PNG. Located, not decoded, here.
      if (type === "caBX") {
        payloads.push({ kind: "c2pa", offset, length, text: latin1(data), fields: {} });
      }

      if (type === "eXIf") {
        payloads.push({ kind: "exif", offset, length, text: "", fields: {} });
      }

      segments.push({
        name: type,
        offset,
        length: length + 12,
        summary:
          type === "IHDR"
            ? `${width}x${height}, ${bitDepth}-bit`
            : type === "tEXt" || type === "iTXt" || type === "zTXt"
              ? clip(latin1(data.subarray(0, 80)), 60)
              : `${length} bytes`,
      });

      if (type === "IEND") break;
    }
  } catch (err) {
    parseErrors.push(err instanceof TruncatedError ? err.message : String(err));
  }

  return {
    format: "png",
    byteLength: bytes.length,
    segments,
    encoder,
    shape: {
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(bitDepth !== undefined ? { bitDepth } : {}),
      codec: `png (${idatCount} IDAT)`,
    },
    jpeg: null,
    payloads,
    parseErrors,
  };
}

function readTextChunk(type: string, data: Uint8Array): { key: string; value: string } | null {
  const nul = data.indexOf(0);
  if (nul < 0) return null;
  const key = latin1(data.subarray(0, nul));
  if (type === "tEXt") return { key, value: latin1(data.subarray(nul + 1)) };
  if (type === "zTXt") return null; // deflate payload; not decompressed, and said so
  // iTXt: key \0 compressionFlag compressionMethod languageTag \0 translatedKey \0 text
  const flag = data[nul + 1];
  if (flag !== 0) return null;
  let p = nul + 3;
  const lang = data.indexOf(0, p);
  if (lang < 0) return null;
  p = lang + 1;
  const translated = data.indexOf(0, p);
  if (translated < 0) return null;
  return { key, value: utf8(data.subarray(translated + 1)) };
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
