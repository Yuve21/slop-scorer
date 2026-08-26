/**
 * The decoder, pointed at bytes somebody chose.
 *
 * `png-export.test.ts` proves the round trip on files we made. This file proves the other half,
 * and it is the half with a security story: `decodePng` is reachable from
 * `detectors-web/probe.ts` -> `recoverText` -> `ocr-text/raster-text.ts`, on image bytes fetched
 * from the page under scan. So the input is chosen by the site being measured, and every
 * assertion below is a file a hostile site could serve.
 *
 * The governing rule is that a malformed file must FAIL, in bounded time and bounded memory,
 * with a typed error. Not hang, not allocate a gigabyte, not decode something plausible.
 *
 * Every case here carries an explicit per-test timeout. That is not decoration: the first case
 * used to spin in a synchronous `while`, which no test timeout can interrupt - the runner itself
 * wedged past 120 s. A synchronous hang is only observable as "this file never finishes", so
 * these tests are also the record of how that was measured.
 */

import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PAPER, PngFormatError, createRaster, decodePng, encodePng } from "@slop/reproduce";

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const be32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes: readonly number[]): number => {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** A well-formed chunk, CRC and all, so a test can be about the ONE thing it is about. */
const chunk = (type: string, body: readonly number[]): number[] => {
  const typed = [...Array.from(type, (ch) => ch.charCodeAt(0)), ...body];
  return [...be32(body.length), ...typed, ...be32(crc32(typed))];
};

const ihdr = (width: number, height: number, colorType = 2): number[] =>
  chunk("IHDR", [...be32(width), ...be32(height), 8, colorType, 0, 0, 0]);

describe("a PNG a hostile page could serve", () => {
  it(
    "does not hang on a chunk length whose top bit is set",
    () => {
      // Twenty bytes. `ff ff ff f4` read as a SIGNED 32-bit integer is -12, and the cursor in the
      // chunk walk advances by `12 + length`, i.e. by nothing. The length check
      // (`at + 8 + length + 4 > bytes.length`) is SATISFIED by a negative length, so it never
      // fires, and the loop spins forever on twenty bytes of input.
      const hostile = Uint8Array.from([...SIGNATURE, 0xff, 0xff, 0xff, 0xf4, ...Array.from("tEXt", (c) => c.charCodeAt(0)), 0, 0, 0, 0]);
      expect(hostile.length).toBe(20);
      expect(() => decodePng(hostile)).toThrow(PngFormatError);
    },
    3_000,
  );

  it(
    "rejects every top-bit-set length, not just the one that happened to sit still",
    () => {
      // The class, not the instance: any length >= 2^31 decodes negative without `>>> 0`, and the
      // ones that are not exactly -12 walk the cursor BACKWARDS, which is the same loop.
      for (const length of [0x8000_0000, 0xffff_ffff, 0xffff_fff4, 0xffff_ff00]) {
        const bytes = Uint8Array.from([...SIGNATURE, ...be32(length | 0), ...Array.from("tEXt", (c) => c.charCodeAt(0)), 0, 0, 0, 0]);
        expect(() => decodePng(bytes), `length 0x${length.toString(16)}`).toThrow(PngFormatError);
      }
    },
    3_000,
  );

  it(
    "refuses a header whose dimensions would allocate more memory than the machine has",
    () => {
      // 65535 x 65535 x 4 bytes is 17 GB of `Uint8ClampedArray`, requested by thirteen bytes.
      const bytes = Uint8Array.from([...SIGNATURE, ...ihdr(65535, 65535), ...chunk("IEND", [])]);
      expect(() => decodePng(bytes)).toThrow(PngFormatError);
      // Named, because a downstream guard would refuse this file for an unrelated reason and an
      // assertion that only says "it threw" would pass with the ceiling deleted.
      expect(() => decodePng(bytes)).toThrow(/ceiling/);
    },
    3_000,
  );

  it(
    "refuses a compression bomb rather than inflating it",
    () => {
      // 32 MB of zeros deflates to a few KB, and the size sanity check downstream used to run
      // AFTER inflation, so the allocation happened before anything could object. The header says
      // 8 x 8, so the decoder knows the raw data can only legitimately be 8 * (24 + 1) bytes.
      const bomb = deflateSync(Buffer.alloc(32 * 1024 * 1024), { level: 9 });
      expect(bomb.length).toBeLessThan(64 * 1024);
      const bytes = Uint8Array.from([
        ...SIGNATURE,
        ...ihdr(8, 8),
        ...chunk("IDAT", Array.from(bomb)),
        ...chunk("IEND", []),
      ]);
      expect(() => decodePng(bytes)).toThrow(PngFormatError);
      expect(() => decodePng(bytes)).toThrow(/did not inflate into the 200 bytes/);
    },
    10_000,
  );

  it(
    "refuses a file made of nothing but chunk headers",
    () => {
      const many: number[] = [...SIGNATURE, ...ihdr(1, 1)];
      for (let i = 0; i < 20_000; i += 1) many.push(...chunk("tEXt", []));
      many.push(...chunk("IEND", []));
      expect(() => decodePng(Uint8Array.from(many))).toThrow(PngFormatError);
      expect(() => decodePng(Uint8Array.from(many))).toThrow(/more than 8192 chunks/);
    },
    10_000,
  );

  it("notices a body that was edited after the file was written", () => {
    // The CRC is the only thing standing between "these pixels" and "the pixels an attacker
    // substituted in transit". The encoder writes it; a decoder that never checks it is carrying
    // a table it uses only to sound careful.
    const good = encodePng(createRaster(4, 4, PAPER));
    const tampered = Uint8Array.from(good);
    // Land inside the IDAT body: past the signature, the IHDR chunk (25 bytes) and the IDAT
    // length + type (8 bytes).
    tampered[8 + 25 + 8 + 2] = (tampered[8 + 25 + 8 + 2]! ^ 0xff) & 0xff;
    expect(() => decodePng(tampered)).toThrow(PngFormatError);
    expect(() => decodePng(tampered)).toThrow(/CRC/i);
    // And the file it was made from still decodes, so the assertion above is about the edit.
    expect(decodePng(good).width).toBe(4);
  });

  it("refuses pixel data that arrives before the header that describes it", () => {
    const bytes = Uint8Array.from([
      ...SIGNATURE,
      ...chunk("IDAT", Array.from(deflateSync(Buffer.alloc(16)))),
      ...ihdr(2, 2),
      ...chunk("IEND", []),
    ]);
    expect(() => decodePng(bytes)).toThrow(PngFormatError);
    expect(() => decodePng(bytes)).toThrow(/before the IHDR/);
  });
});
