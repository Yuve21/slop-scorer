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
import { inflateBounded } from "./inflate.js";
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
        // XMP travels in an iTXt keyed "XML:com.adobe.xmp", and that iTXt may be compressed
        // like any other. Publishing the raw deflate bytes as the XMP text would hand every
        // metadata regex a payload of binary noise, which is the same defect one layer down:
        // a read that reports success over bytes it did not decode.
        if (type === "iTXt" && /xml:com\.adobe\.xmp/i.test(latin1(data.subarray(0, 32)))) {
          if (parsed.ok) payloads.push({ kind: "xmp", offset, length, text: parsed.value, fields: {} });
        }
        if (parsed.ok) {
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
          parseErrors.push(`text chunk "${type}" at ${at(offset)} was not read: ${parsed.reason}`);
        }
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

type TextChunk = { readonly ok: true; readonly key: string; readonly value: string } | { readonly ok: false; readonly reason: string };

/**
 * Read one PNG text chunk, including the compressed forms.
 *
 * ALL THREE CHUNK TYPES CARRY THE SAME METADATA, so all three must produce the same finding.
 * They did not: `zTXt` and compressed `iTXt` returned null here, the caller recorded a parse
 * error nothing consumed, and two PNGs carrying byte-identical AUTOMATIC1111 parameter
 * strings behaved differently while both reported coverage 1.0 (LEARNINGS L-16). `zTXt` is
 * not exotic: Pillow writes it whenever a caller passes `zip=True`, and three of the eleven
 * generator signatures in this package live in PNG text chunks.
 *
 * The failure result is not the same object as an absence. A chunk that is present and
 * unreadable is a fact the laundering gate and the coverage calculation both need, because
 * "no text chunk is present" printed over a file that has one is a fabricated citation.
 *
 * Layouts, from the PNG specification (ISO/IEC 15948, clause 11.3.4):
 *   tEXt: keyword \0 text                                       (Latin-1, uncompressed)
 *   zTXt: keyword \0 compressionMethod text                     (zlib, method 0 only)
 *   iTXt: keyword \0 flag method languageTag \0 translated \0 text   (UTF-8, zlib when flag=1)
 */
function readTextChunk(type: string, data: Uint8Array): TextChunk {
  const nul = data.indexOf(0);
  if (nul < 0) return { ok: false, reason: "the keyword is not null-terminated" };
  const key = latin1(data.subarray(0, nul));
  if (type === "tEXt") return { ok: true, key, value: latin1(data.subarray(nul + 1)) };

  if (type === "zTXt") {
    const method = data[nul + 1];
    if (method === undefined) return { ok: false, reason: "it ends before its compression method byte" };
    // Method 0 (zlib/deflate) is the only method the specification defines. An unknown method
    // is reported rather than guessed: decoding it as deflate anyway would be inventing.
    if (method !== 0) return { ok: false, reason: `it declares compression method ${method}, and only method 0 (zlib) is defined` };
    const out = inflateBounded(data.subarray(nul + 2));
    return out.ok ? { ok: true, key, value: latin1(out.bytes) } : { ok: false, reason: out.reason };
  }

  const flag = data[nul + 1];
  const method = data[nul + 2];
  if (flag === undefined || method === undefined) return { ok: false, reason: "it ends before its compression flag" };
  let p = nul + 3;
  const lang = data.indexOf(0, p);
  if (lang < 0) return { ok: false, reason: "the language tag is not null-terminated" };
  p = lang + 1;
  const translated = data.indexOf(0, p);
  if (translated < 0) return { ok: false, reason: "the translated keyword is not null-terminated" };
  const body = data.subarray(translated + 1);
  if (flag === 0) return { ok: true, key, value: utf8(body) };
  if (flag !== 1) return { ok: false, reason: `it declares compression flag ${flag}, and only 0 and 1 are defined` };
  if (method !== 0) return { ok: false, reason: `it declares compression method ${method}, and only method 0 (zlib) is defined` };
  const out = inflateBounded(body);
  return out.ok ? { ok: true, key, value: utf8(out.bytes) } : { ok: false, reason: out.reason };
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
