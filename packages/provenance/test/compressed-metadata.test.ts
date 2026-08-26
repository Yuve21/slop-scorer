import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import {
  inflateBounded,
  ingestMedia,
  inspectContainer,
  MAX_METADATA_INFLATE_BYTES,
  matchGenerators,
  readMetadata,
  synthMp3,
  synthPng,
} from "@slop/provenance";

/**
 * Compressed container metadata: the same declaration must produce the same finding
 * whichever chunk type carries it.
 *
 * MEASURED BEFORE THE FIX, on two PNGs carrying byte-identical AUTOMATIC1111 parameter
 * strings and differing in nothing but the chunk type (LEARNINGS L-16):
 *
 *   tEXt  coverage 1  metadata probe 1  fired prov.sidecar-declares-generative-tool
 *   zTXt  coverage 1  metadata probe 0  fired NOTHING, and the laundering gate printed
 *                                       "no tEXt, iTXt, eXIf or XMP chunk present" on a file
 *                                       that has one
 *
 * Both said coverage 1.0. One of them had been read. That is the disqualifying defect class
 * at the top of HOUSE-KNOWLEDGE: a guarantee that reports success without doing its job.
 *
 * THE ORDER OF THE ASSERTIONS IS THE POINT, per L-06. Every case below proves the PRESENCE
 * it is about to compare against, in the uncompressed carrier, before asserting that the
 * compressed carrier matches it. A test that only asserted equality would stay green if both
 * carriers went blind at once.
 *
 * MUTATIONS RUN AGAINST THIS FILE (each made, each seen red, each reverted):
 *   1. `container/png.ts`, restore `if (type === "zTXt") return { ok: false, ... }` before
 *      the inflate. Red: "zTXt carries the same declaration as tEXt" and the parity case.
 *   2. `container/png.ts`, in the iTXt branch, `if (flag !== 0) return { ok: false, ... }`.
 *      Red: the compressed-iTXt cases.
 *   3. `container/inflate.ts`, drop the `maxOutputLength` option from `inflateSync`. Red:
 *      "a deflate bomb is refused by the ceiling, not by the allocator".
 *   4. `container/mpeg-audio.ts`, restore `r.skip(2)` in place of the flag read. Red: the
 *      ID3 compressed-frame case.
 */

// One real AUTOMATIC1111 parameter string. `gen.sd-webui-parameters` requires Steps AND
// Sampler AND CFG scale together, so this is the shape the real signature is anchored to.
const A1111 =
  "a lark on a fence post\nNegative prompt: blurry\n" +
  "Steps: 28, Sampler: DPM++ 2M Karras, CFG scale: 7, Seed: 1234567890, Size: 512x512";

const fieldsOf = (bytes: Uint8Array): Record<string, string> => {
  const record = inspectContainer(bytes);
  const out: Record<string, string> = {};
  for (const p of record.payloads) if (p.kind === "png-text") out[p.fields["key"]!] = p.fields["value"]!;
  return out;
};

describe("a PNG declaration reads the same from every text chunk type", () => {
  const baseline = synthPng({ text: { parameters: A1111 } });

  it("the uncompressed baseline really does carry the declaration (the denominator for everything below)", () => {
    const record = inspectContainer(baseline);
    expect(record.parseErrors).toEqual([]);
    expect(fieldsOf(baseline)["parameters"]).toBe(A1111);
    // And it really does reach the generator table, so the parity assertions below are about
    // a signature that can fire rather than about two equal absences.
    const hits = matchGenerators(readMetadata(inspectContainer(baseline)));
    expect(hits.map((h) => h.signature.id)).toContain("gen.sd-webui-parameters");
  });

  const carriers: readonly [string, Uint8Array][] = [
    ["zTXt", synthPng({ textZ: { parameters: A1111 } })],
    ["iTXt uncompressed", synthPng({ textI: { parameters: A1111 } })],
    ["iTXt compressed", synthPng({ textIZ: { parameters: A1111 } })],
  ];

  it.each(carriers)("%s carries the same declaration as tEXt, byte for byte", (_name, bytes) => {
    const record = inspectContainer(bytes);
    expect(record.parseErrors).toEqual([]);
    expect(fieldsOf(bytes)["parameters"]).toBe(A1111);
  });

  it.each(carriers)("%s fires the same generator signature as tEXt", (_name, bytes) => {
    const hits = matchGenerators(readMetadata(inspectContainer(bytes)));
    expect(hits.map((h) => h.signature.id)).toContain("gen.sd-webui-parameters");
  });

  it.each(carriers)("%s reports the same coverage and the same probe denominators as tEXt", (_name, bytes) => {
    const opts = { modality: "image", locator: "fixture://x.png", mediaType: "image/png" } as const;
    const was = ingestMedia(baseline, opts);
    const now = ingestMedia(bytes, opts);
    const shape = (a: typeof was): unknown =>
      a.probes.map((p) => `${p.id}:${p.denominator}:${p.complete !== false}`).join(" ");
    expect(shape(now)).toBe(shape(was));
    expect(now.metadata.fields.length).toBeGreaterThan(0);
  });

  it("the laundering gate can no longer assert the absence of a chunk that is present", () => {
    for (const [, bytes] of carriers) {
      const artifact = ingestMedia(bytes, { modality: "image", locator: "fixture://x.png", mediaType: "image/png" });
      expect(artifact.laundering.indicators.map((i) => i.code)).not.toContain("lossless_resave");
    }
    // A PNG that genuinely has no text chunk still gets the indicator, so the fix above is a
    // narrowing of a false claim and not the deletion of a working one. Its observed value is
    // now COUNTED off the chunks walked rather than being a fixed sentence.
    const bare = ingestMedia(synthPng({}), { modality: "image", locator: "fixture://bare.png", mediaType: "image/png" });
    const found = bare.laundering.indicators.find((i) => i.code === "lossless_resave");
    expect(found).toBeDefined();
    expect(found!.observed).toMatch(/^\d+ chunk\(s\) walked, none of them tEXt, zTXt, iTXt, eXIf or caBX$/);
  });

  it("XMP inside a compressed iTXt is decompressed rather than published as deflate noise", () => {
    const packet = `<x:xmpmeta><Iptc4xmpExt:DigitalSourceType>trainedAlgorithmicMedia</Iptc4xmpExt:DigitalSourceType></x:xmpmeta>`;
    const plain = readMetadata(inspectContainer(synthPng({ xmp: packet })));
    expect(plain.digitalSourceType).toBe("trainedAlgorithmicMedia"); // the presence, first
    const zipped = readMetadata(inspectContainer(synthPng({ xmp: packet, xmpCompressed: true })));
    expect(zipped.digitalSourceType).toBe("trainedAlgorithmicMedia");
  });
});

describe("the decompressor is pointed at bytes somebody else chose", () => {
  // The bound is enforced by zlib DURING inflation, not by a length check afterwards. A
  // check that runs after inflation has already allowed the allocation it exists to prevent.
  it("a deflate bomb is refused by the ceiling, not by the allocator", () => {
    const bomb = deflateSync(Buffer.alloc(MAX_METADATA_INFLATE_BYTES * 4, 0x41));
    expect(bomb.length).toBeLessThan(8_192); // it really is a bomb: small in, huge out
    const started = Date.now();
    const out = inflateBounded(new Uint8Array(bomb));
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.reason).toMatch(/expanded past the 1048576-byte ceiling/);
    expect(Date.now() - started).toBeLessThan(3_000);
  });

  it("a bombed zTXt chunk is a parse error, not a value and not a hang", () => {
    const bomb = [...deflateSync(Buffer.alloc(MAX_METADATA_INFLATE_BYTES * 4, 0x41))];
    const bytes = synthPng({ rawChunks: [{ type: "zTXt", data: [...enc("parameters"), 0, 0, ...bomb] }] });
    const record = inspectContainer(bytes);
    expect(record.parseErrors.join(" ")).toMatch(/zTXt.*expanded past the 1048576-byte ceiling/);
    expect(fieldsOf(bytes)["parameters"]).toBeUndefined();
  });

  it("an undefined compression method is reported rather than decoded as deflate anyway", () => {
    const bytes = synthPng({ rawChunks: [{ type: "zTXt", data: [...enc("parameters"), 0, 9, 1, 2, 3] }] });
    expect(inspectContainer(bytes).parseErrors.join(" ")).toMatch(/compression method 9/);
  });

  it("a truncated deflate stream is reported rather than half-read", () => {
    const half = [...deflateSync(Buffer.from(A1111))].slice(0, 6);
    const bytes = synthPng({ rawChunks: [{ type: "zTXt", data: [...enc("parameters"), 0, 0, ...half] }] });
    const record = inspectContainer(bytes);
    expect(record.parseErrors.join(" ")).toMatch(/not a readable deflate stream/);
    expect(fieldsOf(bytes)["parameters"]).toBeUndefined();
  });

  it("an empty compressed payload is a stated reason, never an empty string masquerading as a value", () => {
    expect(inflateBounded(new Uint8Array(0))).toEqual({ ok: false, reason: "the compressed payload is empty" });
  });
});

describe("the same defect in the other container that allows compressed metadata", () => {
  // ID3v2 frames may be zlib-compressed. The flag bytes used to be SKIPPED, so a compressed
  // TSSE was decoded as though its deflate stream were text and the mojibake was stored as
  // the encoder's name. Silence would have been bad; a manufactured value is worse, because
  // this file's own encoder-conflict comparison then contrasts a real name against noise.
  const TSSE = "Lavf60.16.101";

  it("an uncompressed TSSE really does reach the encoder field (the denominator)", () => {
    const record = inspectContainer(synthMp3({ id3: { TSSE } }));
    expect(record.encoder?.value).toBe(TSSE);
  });

  it("a compressed TSSE frame is read, and reads the same", () => {
    const bytes = synthMp3({ id3: { TSSE }, id3CompressedFrames: true });
    const record = inspectContainer(bytes);
    expect(record.parseErrors).toEqual([]);
    expect(record.encoder?.value).toBe(TSSE);
  });

  // Sibling found while fixing the flags: the frame size is SYNCSAFE in ID3v2.4 and a plain
  // integer in v2.3, and the walk read it as plain for both. Every v2.4 frame of 128 bytes or
  // more was therefore mis-sized, which walks the cursor into the middle of the tag. A length
  // read from a file is only a number once you know which encoding it is in.
  it("an ID3v2.4 frame of 128 bytes or more is sized syncsafe, not as a plain integer", () => {
    const long = `Lavf60.16.101 ${"x".repeat(200)}`;
    expect(long.length + 1).toBeGreaterThanOrEqual(128); // the case only bites above 0x7f
    const record = inspectContainer(synthMp3({ id3: { TSSE: long }, id3Major: 4 }));
    expect(record.parseErrors).toEqual([]);
    expect(record.encoder?.value).toContain("Lavf60.16.101");
  });

  it("an ID3v2.4 compressed frame, whose data length indicator is mandatory, is read", () => {
    const record = inspectContainer(synthMp3({ id3: { TSSE }, id3Major: 4, id3CompressedFrames: true }));
    expect(record.parseErrors).toEqual([]);
    expect(record.encoder?.value).toBe(TSSE);
  });

  it("an unreadable compressed frame is a parse error, never a value made of noise", () => {
    const bytes = synthMp3({ id3: { TSSE }, id3CompressedFrames: true, corruptId3Compression: true });
    const record = inspectContainer(bytes);
    expect(record.parseErrors.join(" ")).toMatch(/ID3 frame "TSSE".*not a readable deflate stream/);
    expect(record.encoder).toBeNull();
  });
});

const enc = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
