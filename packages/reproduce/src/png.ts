/**
 * PNG in and PNG out, with no dependencies.
 *
 * The figure is composed into our own `Raster` (see `raster.ts`) precisely so the test that
 * guards it can read pixels. But a raster is not a distribution artifact: what travels is a
 * file. This module is the last few inches of that path, and it has two jobs, only one of
 * which is obvious.
 *
 *  1. ENCODE. Turn the composed figure into bytes a browser will save and a timeline will show.
 *  2. DECODE. Turn those exact bytes back into a raster, so the ship-blocking check in
 *     `compose.ts` can run on THE FILE rather than on the object the file was made from.
 *
 * The second job is the reason this file exists at all. Checking the raster and then encoding
 * it would leave the encoder untested by the only check whose failure is a legal exposure: a
 * row-order bug, a truncated final scanline, a wrong bit depth would each ship a figure whose
 * disclaimer is not where we say it is, and every check upstream would still be green. So the
 * export path encodes, decodes, and checks the decode. The round trip is the guarantee.
 *
 * Colour type 2 (8-bit RGB, no alpha, no interlace) on the way out, because every figure this
 * package composes is opaque. On the way in, colour types 2 and 6 and all five scanline filters
 * are accepted, so the checker also works on a PNG some other tool produced.
 */

import { deflateSync, inflateSync } from "node:zlib";
import type { Raster } from "./raster.js";

export class PngFormatError extends Error {
  constructor(detail: string) {
    super(`this is not a PNG we can read: ${detail}`);
    this.name = "PngFormatError";
  }
}

const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = (CRC_TABLE[(c ^ (bytes[i] as number)) & 0xff] as number) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const u32 = (value: number): Uint8Array =>
  Uint8Array.from([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);

function chunk(type: string, body: Uint8Array): Uint8Array {
  const typeBytes = Uint8Array.from(Array.from(type, (ch) => ch.charCodeAt(0)));
  const payload = new Uint8Array(typeBytes.length + body.length);
  payload.set(typeBytes, 0);
  payload.set(body, typeBytes.length);
  const out = new Uint8Array(4 + payload.length + 4);
  out.set(u32(body.length), 0);
  out.set(payload, 4);
  out.set(u32(crc32(payload)), 4 + payload.length);
  return out;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Encode an opaque raster as an 8-bit RGB PNG. Deterministic: same pixels, same bytes. */
export function encodePng(raster: Raster): Uint8Array {
  const { width, height, data } = raster;
  const stride = width * 3;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter: none. Nothing downstream has to guess.
    for (let x = 0; x < width; x += 1) {
      const src = (y * width + x) * 4;
      const dst = rowStart + 1 + x * 3;
      raw[dst] = data[src] as number;
      raw[dst + 1] = data[src + 1] as number;
      raw[dst + 2] = data[src + 2] as number;
    }
  }
  const ihdr = concat([u32(width), u32(height), Uint8Array.from([8, 2, 0, 0, 0])]);
  const idat = new Uint8Array(deflateSync(raw, { level: 9 }));
  return concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))]);
}

const readU32 = (b: Uint8Array, at: number): number =>
  ((b[at] as number) << 24) | ((b[at + 1] as number) << 16) | ((b[at + 2] as number) << 8) | (b[at + 3] as number);

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
};

/**
 * Decode a PNG back into a raster.
 *
 * Strict on purpose. Every unsupported case throws rather than guessing, because a decoder that
 * guesses would let the export gate pass a file it did not actually read.
 */
export function decodePng(bytes: Uint8Array): Raster {
  for (let i = 0; i < SIGNATURE.length; i += 1) {
    if (bytes[i] !== SIGNATURE[i]) throw new PngFormatError("the 8-byte signature is wrong");
  }
  let at = SIGNATURE.length;
  let width = 0;
  let height = 0;
  let colorType = -1;
  const idat: Uint8Array[] = [];
  let sawEnd = false;

  while (at + 8 <= bytes.length) {
    const length = readU32(bytes, at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (at + 8 + length + 4 > bytes.length) throw new PngFormatError(`chunk ${type} runs past the end of the file`);
    if (type === "IHDR") {
      width = readU32(body, 0);
      height = readU32(body, 4);
      const depth = body[8];
      colorType = body[9] as number;
      if (depth !== 8) throw new PngFormatError(`bit depth ${String(depth)} is not supported, only 8`);
      if (colorType !== 2 && colorType !== 6) {
        throw new PngFormatError(`colour type ${colorType} is not supported, only 2 and 6`);
      }
      if (body[12] !== 0) throw new PngFormatError("interlaced files are not supported");
    } else if (type === "IDAT") {
      idat.push(body.slice());
    } else if (type === "IEND") {
      sawEnd = true;
    }
    at += 12 + length;
  }
  if (!sawEnd) throw new PngFormatError("there is no IEND chunk, so the file is truncated");
  if (width <= 0 || height <= 0) throw new PngFormatError("there is no IHDR chunk, so the dimensions are unknown");

  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = new Uint8Array(inflateSync(concat(idat)));
  if (raw.length < height * (stride + 1)) {
    throw new PngFormatError(`the pixel data is ${raw.length} bytes where ${height * (stride + 1)} are needed`);
  }

  const out = new Uint8ClampedArray(width * height * 4);
  const line = new Uint8Array(stride);
  const previous = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart] as number;
    for (let i = 0; i < stride; i += 1) {
      const x = raw[rowStart + 1 + i] as number;
      const a = i >= bpp ? (line[i - bpp] as number) : 0;
      const b = previous[i] as number;
      const c = i >= bpp ? (previous[i - bpp] as number) : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = x;
          break;
        case 1:
          value = x + a;
          break;
        case 2:
          value = x + b;
          break;
        case 3:
          value = x + ((a + b) >> 1);
          break;
        case 4:
          value = x + paeth(a, b, c);
          break;
        default:
          throw new PngFormatError(`scanline filter ${filter} is not one of the five defined by the format`);
      }
      line[i] = value & 0xff;
    }
    for (let x = 0; x < width; x += 1) {
      const dst = (y * width + x) * 4;
      out[dst] = line[x * bpp] as number;
      out[dst + 1] = line[x * bpp + 1] as number;
      out[dst + 2] = line[x * bpp + 2] as number;
      out[dst + 3] = bpp === 4 ? (line[x * bpp + 3] as number) : 255;
    }
    previous.set(line);
  }
  return { width, height, data: out };
}
