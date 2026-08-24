import { describe, expect, it } from "vitest";
import {
  inspectContainer,
  readMetadata,
  synthJpeg,
  synthMp3,
  synthMp4,
  synthPng,
  synthWav,
} from "@slop/provenance";

/**
 * The container parsers, against real bytes.
 *
 * Every case below is a whole file built to the format's own specification and read by the
 * same code path a user's upload takes. The point is not coverage for its own sake: a media
 * detector's citations are BYTE OFFSETS, and an offset is invisible in a hand-written object
 * literal. If a parser drifts, these go red instead of the fixtures quietly agreeing with it.
 */

describe("format dispatch is by magic bytes, never by extension", () => {
  const cases: readonly [string, Uint8Array, string][] = [
    ["JPEG", synthJpeg({}), "jpeg"],
    ["PNG", synthPng({}), "png"],
    ["ISO-BMFF", synthMp4({}), "iso-bmff"],
    ["RIFF WAVE", synthWav({}), "riff-wave"],
    ["MPEG audio", synthMp3({ id3: { TSSE: "LAME" } }), "mpeg-audio"],
  ];

  it.each(cases)("%s is identified from its own bytes", (_name, bytes, format) => {
    expect(inspectContainer(bytes).format).toBe(format);
  });

  it("a file too short to identify says so rather than guessing", () => {
    const record = inspectContainer(Uint8Array.from([1, 2, 3]));
    expect(record.format).toBe("unknown");
    expect(record.parseErrors.join(" ")).toMatch(/too short/);
  });

  it("unrecognised magic bytes are reported with the bytes themselves", () => {
    const record = inspectContainer(Uint8Array.from(Array.from({ length: 32 }, (_, i) => i)));
    expect(record.format).toBe("unknown");
    expect(record.parseErrors.join(" ")).toMatch(/unrecognised magic bytes: 00 01 02/);
  });
});

describe("JPEG", () => {
  const bytes = synthJpeg({
    width: 6048,
    height: 4024,
    jfif: true,
    quant: 90,
    chroma: "4:2:0",
    makerNoteBytes: 512,
    exif: { Make: "FUJIFILM", Model: "X-T5", Software: "Capture One 23", DateTimeOriginal: "2024:09:02 17:03:44" },
    trailing: 4,
  });
  const record = inspectContainer(bytes);

  it("walks the marker chain and locates every segment by offset", () => {
    const names = record.segments.map((s) => s.name);
    expect(names).toContain("SOI");
    expect(names).toContain("APP0");
    expect(names).toContain("APP1");
    expect(names).toContain("DQT");
    expect(names).toContain("SOF0 (baseline)");
    expect(names).toContain("SOS");
    expect(names).toContain("EOI");
    for (const segment of record.segments) expect(segment.offset).toBeGreaterThanOrEqual(0);
  });

  it("reads the frame header, the sampling factors and the JFIF flag", () => {
    expect(record.shape.width).toBe(6048);
    expect(record.shape.height).toBe(4024);
    expect(record.jpeg?.chromaSubsampling).toBe("4:2:0");
    expect(record.jpeg?.jfif).toBe(true);
    expect(record.jpeg?.qualityEstimate).toBe(90);
  });

  it("counts bytes after the end-of-image marker", () => {
    expect(record.jpeg?.trailingBytes).toBe(4);
  });

  it("reads the ASCII EXIF tags out of a real TIFF IFD, and notices the MakerNote", () => {
    const metadata = readMetadata(record);
    expect(metadata.make).toBe("FUJIFILM");
    expect(metadata.model).toBe("X-T5");
    expect(metadata.hasMakerNote).toBe(true);
    expect(metadata.hasCaptureTime).toBe(true);
    expect(record.encoder?.field).toBe("EXIF:Software");
    expect(record.encoder?.value).toBe("Capture One 23");
  });

  it("skips the entropy-coded scan without decoding it, stuffed bytes and all", () => {
    // The scan in the fixture contains a stuffed 0xFF00. A skipper that treated it as a marker
    // would stop early and never reach EOI, so the presence of EOI is the assertion.
    expect(record.segments.map((s) => s.name)).toContain("EOI");
    expect(record.parseErrors).toEqual([]);
  });

  it("locates a JUMBF box in APP11 without reading it as provenance", () => {
    const withBox = inspectContainer(synthJpeg({ c2paBox: true }));
    const payload = withBox.payloads.find((p) => p.kind === "c2pa");
    expect(payload).toBeDefined();
    expect(payload?.offset).toBeGreaterThan(0);
  });
});

describe("PNG", () => {
  it("verifies every chunk CRC and refuses the contents of one that fails", () => {
    const good = inspectContainer(synthPng({ text: { Software: "Krita 5.2" } }));
    expect(good.parseErrors).toEqual([]);
    expect(good.encoder?.value).toBe("Krita 5.2");

    const bad = inspectContainer(synthPng({ text: { Software: "Krita 5.2" }, corruptCrcOf: "tEXt" }));
    expect(bad.parseErrors.join(" ")).toMatch(/fails its CRC/);
    expect(bad.encoder).toBeNull();
  });

  it("reads IHDR and reports the IDAT count", () => {
    const record = inspectContainer(synthPng({ width: 1536, height: 864 }));
    expect(record.shape.width).toBe(1536);
    expect(record.shape.height).toBe(864);
    expect(record.shape.codec).toMatch(/1 IDAT/);
  });

  it("reads an iTXt XMP packet as XMP rather than as a text chunk name", () => {
    const record = inspectContainer(synthPng({ xmp: "<xmp:CreatorTool>Krita 5.2</xmp:CreatorTool>" }));
    expect(record.payloads.map((p) => p.kind)).toContain("xmp");
    expect(readMetadata(record).fields.map((f) => f.name)).toContain("CreatorTool");
  });
});

describe("ISO base media", () => {
  const record = inspectContainer(
    synthMp4({
      brands: ["qt  ", "qt  ", "mp42"],
      timescale: 600,
      durationSeconds: 12,
      width: 3840,
      height: 2160,
      udta: { "©mak": "Apple", "©mod": "iPhone 15 Pro", "©too": "17.5.1" },
    }),
  );

  it("walks the box tree and names boxes by their path", () => {
    const names = record.segments.map((s) => s.name);
    expect(names).toContain("ftyp");
    expect(names).toContain("moov");
    expect(names).toContain("moov/mvhd");
    expect(names).toContain("moov/trak/mdia/minf/stbl/stsd");
    expect(names.some((n) => n.endsWith("/udta"))).toBe(true);
  });

  it("reads the brands, the timescale and the duration", () => {
    expect(record.shape.brands).toContain("qt");
    expect(record.shape.timescale).toBe(600);
    expect(record.shape.durationSeconds).toBe(12);
  });

  it("reads the visual sample entry's dimensions from the right offset", () => {
    // The offset arithmetic here was wrong once (8 reserved bytes instead of 6) and produced a
    // height of zero, which would have silently disabled the geometry indicator.
    expect(record.shape.width).toBe(3840);
    expect(record.shape.height).toBe(2160);
    expect(record.shape.codec).toBe("avc1");
  });

  it("reads the QuickTime writer atoms and exposes make and model as metadata", () => {
    expect(record.encoder?.field).toBe("ISO-BMFF:©too");
    expect(record.encoder?.value).toBe("17.5.1");
    const names = readMetadata(record).fields.map((f) => f.name);
    expect(names).toContain("make");
    expect(names).toContain("model");
  });

  it("reads an audio sample entry's channels and sample rate", () => {
    const audio = inspectContainer(synthMp4({ audioOnly: true, sampleRate: 48_000, channels: 2, codec: "mp4a" }));
    expect(audio.shape.codec).toBe("mp4a");
    expect(audio.shape.channels).toBe(2);
    expect(audio.shape.sampleRate).toBe(48_000);
  });

  it("a box declaring a size past the end is a parse error, not a hang", () => {
    const bytes = synthMp4({});
    const truncated = bytes.subarray(0, bytes.length - 40);
    const broken = inspectContainer(truncated);
    expect(broken.parseErrors.length).toBeGreaterThan(0);
  });
});

describe("RIFF WAVE", () => {
  const record = inspectContainer(
    synthWav({ sampleRate: 96_000, bitDepth: 24, channels: 2, seconds: 5, info: { ISFT: "Pro Tools 2025.6" } }),
  );

  it("reads the format chunk and computes the duration from the data chunk", () => {
    expect(record.shape.sampleRate).toBe(96_000);
    expect(record.shape.bitDepth).toBe(24);
    expect(record.shape.channels).toBe(2);
    expect(record.shape.durationSeconds).toBe(5);
    expect(record.shape.codec).toBe("pcm");
  });

  it("reads the INFO list and treats ISFT as the writer field", () => {
    expect(record.encoder?.field).toBe("RIFF:LIST/INFO/ISFT");
    expect(record.encoder?.value).toBe("Pro Tools 2025.6");
  });

  it("reads a _PMX chunk as XMP, which is where XMP lives in a RIFF file", () => {
    const withXmp = inspectContainer(synthWav({ xmp: "<xmp:CreatorTool>iZotope RX 11</xmp:CreatorTool>" }));
    expect(withXmp.payloads.map((p) => p.kind)).toContain("xmp");
    expect(readMetadata(withXmp).fields.map((f) => f.value)).toContain("iZotope RX 11");
  });
});

describe("MPEG audio", () => {
  it("reads ID3v2 text frames and the frame header", () => {
    const record = inspectContainer(synthMp3({ id3: { TSSE: "Lavf60.16.100", TIT2: "a track" } }));
    expect(record.encoder?.field).toBe("ID3v2:TSSE");
    expect(record.encoder?.value).toBe("Lavf60.16.100");
    expect(record.shape.sampleRate).toBe(44_100);
    expect(record.segments.map((s) => s.name)).toContain("frame");
  });

  it("reads the LAME tag inside the Xing frame", () => {
    const record = inspectContainer(synthMp3({ lame: "LAME3.100" }));
    expect(record.segments.map((s) => s.name)).toContain("LAME");
    expect(record.encoder?.field).toBe("LAME");
  });

  it("records a conflict when the tag and the frame name different encoders", () => {
    // Two encoders in one file is the strongest re-encode fingerprint in this container.
    const record = inspectContainer(synthMp3({ id3: { TSSE: "ElevenLabs" }, lame: "LAME3.100" }));
    const conflict = record.payloads.find((p) => p.fields["conflictingEncoder"]);
    expect(conflict?.fields["declaredEncoder"]).toBe("ElevenLabs");
    expect(conflict?.fields["conflictingEncoder"]).toBe("LAME3.100");
  });
});
