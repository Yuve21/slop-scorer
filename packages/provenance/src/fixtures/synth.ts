/**
 * Real files, built byte by byte.
 *
 * Every fixture in these three packages is produced here and then parsed by the SAME parsers
 * that read a user's upload. Nothing hand-writes a `ContainerRecord`.
 *
 * That is not fastidiousness. `CONTRIBUTING.md` records two rules in this repository that
 * fired on their fixtures and on nothing in the world — a hue band that could not express
 * Tailwind's blue, and a font matcher that could not express what `next/font` actually emits.
 * A media detector is far more exposed to that failure than a DOM one, because a marker
 * offset is invisible in a pretty object literal. So the fixtures are bytes: SOI, APP0, APP1
 * with a real TIFF IFD, DQT with a real quantisation table, real PNG chunks with real CRCs,
 * a real ISO-BMFF box tree. If a parser breaks, the fixture stops parsing and the suite goes
 * red, rather than the object literal quietly agreeing with the broken parser forever.
 *
 * None of these are photographs. They carry no image data worth the name: the entropy-coded
 * scan is a handful of filler bytes, because no rule in this package reads a pixel and code
 * that reads no pixels needs no pixels to test.
 */

import { crc32 } from "../container/png.js";
import { IJG_LUMA_TABLE, scaledIjgTable } from "../container/jpeg.js";

const enc = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
const u16be = (n: number): number[] => [(n >> 8) & 0xff, n & 0xff];
const u32be = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u16le = (n: number): number[] => [n & 0xff, (n >> 8) & 0xff];
const u32le = (n: number): number[] => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];

// ---------------------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------------------

export interface JpegOptions {
  readonly width?: number;
  readonly height?: number;
  /** ASCII EXIF tags to write into a real little-endian TIFF IFD. */
  readonly exif?: Readonly<Record<string, string>>;
  /** Write a MakerNote entry of this byte length. Cameras do; software encoders do not. */
  readonly makerNoteBytes?: number;
  /** Write a JFIF APP0. libjpeg does; most cameras do not. */
  readonly jfif?: boolean;
  /**
   * Quantisation table. `"camera"` writes a bespoke table that is not on the IJG ladder;
   * a number writes the reference table scaled to that IJG quality.
   */
  readonly quant?: "camera" | number;
  /** XMP packet, written into an APP1 with the Adobe namespace prefix. */
  readonly xmp?: string;
  /** A JUMBF/C2PA box in APP11. Located but never verified by this build. */
  readonly c2paBox?: boolean;
  readonly chroma?: "4:4:4" | "4:2:0";
  readonly trailing?: number;
}

const EXIF_TAG_IDS: Readonly<Record<string, number>> = {
  Make: 0x010f,
  Model: 0x0110,
  Software: 0x0131,
  DateTime: 0x0132,
  Artist: 0x013b,
  Copyright: 0x8298,
  DateTimeOriginal: 0x9003,
};

/** A real little-endian TIFF header + IFD0 with ASCII entries, values packed after the IFD. */
function tiffIfd(tags: Readonly<Record<string, string>>, makerNoteBytes: number): number[] {
  const entries: { id: number; type: number; count: number; inline: number[] | null; value: number[] }[] = [];
  for (const [name, text] of Object.entries(tags)) {
    const id = EXIF_TAG_IDS[name];
    if (id === undefined) continue;
    const value = [...enc(text), 0];
    entries.push({ id, type: 2, count: value.length, inline: value.length <= 4 ? value : null, value });
  }
  if (makerNoteBytes > 0) {
    entries.push({
      id: 0x927c,
      type: 7,
      count: makerNoteBytes,
      inline: null,
      value: Array.from({ length: makerNoteBytes }, (_, i) => (i * 7) & 0xff),
    });
  }
  entries.sort((a, b) => a.id - b.id);

  const header = [0x49, 0x49, 0x2a, 0x00, ...u32le(8)];
  const ifdSize = 2 + entries.length * 12 + 4;
  let valueCursor = 8 + ifdSize;
  const ifd: number[] = [...u16le(entries.length)];
  const values: number[] = [];
  for (const e of entries) {
    ifd.push(...u16le(e.id), ...u16le(e.type), ...u32le(e.count));
    if (e.inline) {
      ifd.push(...e.inline, ...new Array(4 - e.inline.length).fill(0));
    } else {
      ifd.push(...u32le(valueCursor));
      values.push(...e.value);
      valueCursor += e.value.length;
    }
  }
  ifd.push(...u32le(0)); // no IFD1
  return [...header, ...ifd, ...values];
}

/** The reference table scaled the way libjpeg scales it, so the inverse recovers `quality`. */
export const ijgTableAt = scaledIjgTable;

/**
 * A bespoke table, of the kind a camera ships.
 *
 * It must be far enough off the reference SHAPE that the elementwise inverse rejects it, not
 * merely off in its sum. Built by perturbing each coefficient by a fixed, reproducible amount
 * so the fixture is deterministic and so a change to the inverse's tolerance shows up here.
 */
const CAMERA_TABLE: readonly number[] = IJG_LUMA_TABLE.map((v, i) =>
  Math.min(255, Math.max(1, Math.round(v * 0.65) + ((i * 13) % 17))),
);

export function synthJpeg(options: JpegOptions = {}): Uint8Array {
  const width = options.width ?? 4032;
  const height = options.height ?? 3024;
  const out: number[] = [0xff, 0xd8];

  if (options.jfif) {
    const payload = [...enc("JFIF"), 0, 1, 2, 0, ...u16be(1), ...u16be(1), 0, 0];
    out.push(0xff, 0xe0, ...u16be(payload.length + 2), ...payload);
  }

  if (options.exif || options.makerNoteBytes) {
    const tiff = tiffIfd(options.exif ?? {}, options.makerNoteBytes ?? 0);
    const payload = [...enc("Exif"), 0, 0, ...tiff];
    out.push(0xff, 0xe1, ...u16be(payload.length + 2), ...payload);
  }

  if (options.xmp) {
    const payload = [...enc("http://ns.adobe.com/xap/1.0/"), 0, ...enc(options.xmp)];
    out.push(0xff, 0xe1, ...u16be(payload.length + 2), ...payload);
  }

  if (options.c2paBox) {
    // A minimal JUMBF superbox: length, "jumb", then a description box naming c2pa.
    const inner = [...u32be(24), ...enc("jumd"), ...enc("c2pa"), ...enc("00000000")];
    const payload = [...u32be(inner.length + 8), ...enc("jumb"), ...inner];
    out.push(0xff, 0xeb, ...u16be(payload.length + 2), ...payload);
  }

  const table = options.quant === undefined || options.quant === "camera" ? CAMERA_TABLE : ijgTableAt(options.quant);
  out.push(0xff, 0xdb, ...u16be(2 + 1 + 64), 0x00, ...table);

  const sampling = options.chroma === "4:2:0" ? 0x22 : 0x11;
  const sof = [
    8,
    ...u16be(height),
    ...u16be(width),
    3,
    1,
    sampling,
    0,
    2,
    0x11,
    0,
    3,
    0x11,
    0,
  ];
  out.push(0xff, 0xc0, ...u16be(sof.length + 2), ...sof);

  const dht = [0x00, ...new Array(16).fill(0).map((_, i) => (i === 0 ? 1 : 0)), 0x00];
  out.push(0xff, 0xc4, ...u16be(dht.length + 2), ...dht);

  const sos = [3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0];
  out.push(0xff, 0xda, ...u16be(sos.length + 2), ...sos);
  out.push(0x12, 0x34, 0xff, 0x00, 0x56, 0x78); // a stuffed 0xFF, so the scan skip is exercised
  out.push(0xff, 0xd9);
  for (let i = 0; i < (options.trailing ?? 0); i += 1) out.push(0x00);

  return Uint8Array.from(out);
}

// ---------------------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------------------

export interface PngOptions {
  readonly width?: number;
  readonly height?: number;
  /** tEXt chunks, keyed. This is where local generation tools write their parameters. */
  readonly text?: Readonly<Record<string, string>>;
  readonly xmp?: string;
  readonly c2paBox?: boolean;
  /** Corrupt the CRC of the named chunk, to exercise the verification path. */
  readonly corruptCrcOf?: string;
}

function pngChunk(type: string, data: number[], corrupt: boolean): number[] {
  const typeAndData = [...enc(type), ...data];
  const crc = corrupt ? 0 : crc32(Uint8Array.from(typeAndData));
  return [...u32be(data.length), ...typeAndData, ...u32be(crc)];
}

export function synthPng(options: PngOptions = {}): Uint8Array {
  const width = options.width ?? 1024;
  const height = options.height ?? 1024;
  const out: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const corrupt = (type: string): boolean => options.corruptCrcOf === type;

  out.push(...pngChunk("IHDR", [...u32be(width), ...u32be(height), 8, 6, 0, 0, 0], corrupt("IHDR")));
  for (const [key, value] of Object.entries(options.text ?? {})) {
    out.push(...pngChunk("tEXt", [...enc(key), 0, ...enc(value)], corrupt("tEXt")));
  }
  if (options.xmp) {
    const key = "XML:com.adobe.xmp";
    out.push(...pngChunk("iTXt", [...enc(key), 0, 0, 0, 0, 0, ...enc(options.xmp)], corrupt("iTXt")));
  }
  if (options.c2paBox) out.push(...pngChunk("caBX", [...enc("c2pa"), ...new Array(16).fill(0)], corrupt("caBX")));
  out.push(...pngChunk("IDAT", [0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01], corrupt("IDAT")));
  out.push(...pngChunk("IEND", [], corrupt("IEND")));
  return Uint8Array.from(out);
}

// ---------------------------------------------------------------------------------------
// ISO-BMFF (MP4 / M4A)
// ---------------------------------------------------------------------------------------

export interface Mp4Options {
  readonly brands?: readonly string[];
  readonly width?: number;
  readonly height?: number;
  readonly timescale?: number;
  readonly durationSeconds?: number;
  /** QuickTime user-data atoms: `©too`, `©swr`, `©mak`, `©mod`. */
  readonly udta?: Readonly<Record<string, string>>;
  readonly codec?: string;
  readonly c2paBox?: boolean;
  /** An XMP packet, written as a real `XMP_` box under `udta`. */
  readonly xmp?: string;
  readonly audioOnly?: boolean;
  readonly sampleRate?: number;
  readonly channels?: number;
}

const box = (type: string, body: number[]): number[] => [...u32be(body.length + 8), ...enc(type), ...body];

export function synthMp4(options: Mp4Options = {}): Uint8Array {
  const brands = options.brands ?? ["isom", "isom", "iso2", "avc1", "mp41"];
  const timescale = options.timescale ?? 90_000;
  const duration = Math.round((options.durationSeconds ?? 8) * timescale);
  const codec = options.codec ?? (options.audioOnly ? "mp4a" : "avc1");

  const ftypBody = [...enc(brands[0] ?? "isom"), ...u32be(512), ...brands.slice(1).flatMap((b) => enc(b))];
  const ftyp = box("ftyp", ftypBody);

  const mvhd = box("mvhd", [
    0,
    0,
    0,
    0,
    ...u32be(0),
    ...u32be(0),
    ...u32be(timescale),
    ...u32be(duration),
    ...new Array(80).fill(0),
  ]);

  const sampleEntryBody = options.audioOnly
    ? [
        ...new Array(6).fill(0),
        ...u16be(1),
        ...u16be(0),
        ...u16be(0),
        ...u32be(0),
        ...u16be(options.channels ?? 2),
        ...u16be(16),
        ...u16be(0),
        ...u16be(0),
        ...u32be((options.sampleRate ?? 44_100) << 16),
      ]
    : [
        ...new Array(6).fill(0),
        ...u16be(1),
        ...u16be(0),
        ...u16be(0),
        ...new Array(12).fill(0),
        ...u16be(options.width ?? 1920),
        ...u16be(options.height ?? 1080),
        ...new Array(50).fill(0),
      ];
  const stsd = box("stsd", [0, 0, 0, 0, ...u32be(1), ...box(codec, sampleEntryBody)]);
  const stbl = box("stbl", stsd);
  const minf = box("minf", stbl);
  const mdia = box("mdia", minf);
  const trak = box("trak", mdia);

  const udtaChildren: number[] = [];
  for (const [key, value] of Object.entries(options.udta ?? {})) {
    udtaChildren.push(...box(key, [...u16be(value.length), ...u16be(0), ...enc(value)]));
  }
  if (options.xmp) udtaChildren.push(...box("XMP_", enc(options.xmp)));
  if (options.c2paBox) {
    udtaChildren.push(...box("uuid", [...enc("c2pa"), ...new Array(24).fill(0)]));
  }
  const udta = udtaChildren.length > 0 ? box("udta", udtaChildren) : [];

  const moov = box("moov", [...mvhd, ...trak, ...udta]);
  const mdat = box("mdat", new Array(64).fill(0x21));
  return Uint8Array.from([...ftyp, ...moov, ...mdat]);
}

// ---------------------------------------------------------------------------------------
// RIFF WAVE
// ---------------------------------------------------------------------------------------

export interface WavOptions {
  readonly sampleRate?: number;
  readonly channels?: number;
  readonly bitDepth?: number;
  readonly seconds?: number;
  readonly info?: Readonly<Record<string, string>>;
  readonly c2paChunk?: boolean;
  /** An XMP packet, written as a real `_PMX` chunk. */
  readonly xmp?: string;
}

export function synthWav(options: WavOptions = {}): Uint8Array {
  const sampleRate = options.sampleRate ?? 48_000;
  const channels = options.channels ?? 1;
  const bitDepth = options.bitDepth ?? 24;
  const dataBytes = Math.round((options.seconds ?? 2) * sampleRate * channels * (bitDepth / 8));
  const byteRate = sampleRate * channels * (bitDepth / 8);

  const fmt = [...enc("fmt "), ...u32le(16), ...u16le(1), ...u16le(channels), ...u32le(sampleRate), ...u32le(byteRate), ...u16le(channels * (bitDepth / 8)), ...u16le(bitDepth)];

  const infoEntries: number[] = [];
  for (const [key, value] of Object.entries(options.info ?? {})) {
    const padded = value.length % 2 === 0 ? `${value}\0\0` : `${value}\0`;
    infoEntries.push(...enc(key), ...u32le(padded.length), ...enc(padded));
  }
  const list = infoEntries.length > 0 ? [...enc("LIST"), ...u32le(4 + infoEntries.length), ...enc("INFO"), ...infoEntries] : [];
  const c2pa = options.c2paChunk ? [...enc("C2PA"), ...u32le(16), ...new Array(16).fill(0)] : [];
  const xmpBody = options.xmp ? (options.xmp.length % 2 === 0 ? options.xmp : `${options.xmp} `) : "";
  const xmp = options.xmp ? [...enc("_PMX"), ...u32le(xmpBody.length), ...enc(xmpBody)] : [];

  const data = [...enc("data"), ...u32le(dataBytes), ...new Array(dataBytes).fill(0)];
  const body = [...enc("WAVE"), ...fmt, ...list, ...xmp, ...c2pa, ...data];
  return Uint8Array.from([...enc("RIFF"), ...u32le(body.length), ...body]);
}

// ---------------------------------------------------------------------------------------
// MPEG audio (MP3)
// ---------------------------------------------------------------------------------------

export interface Mp3Options {
  /** ID3v2 text frames, e.g. `{ TSSE: "Lavf60.16.100" }`. */
  readonly id3?: Readonly<Record<string, string>>;
  /** The nine-byte LAME tag inside the Xing frame. */
  readonly lame?: string;
}

export function synthMp3(options: Mp3Options = {}): Uint8Array {
  const frames: number[] = [];
  for (const [id, value] of Object.entries(options.id3 ?? {})) {
    const body = [0, ...enc(value)];
    frames.push(...enc(id), ...u32be(body.length), 0, 0, ...body);
  }
  const syncSafe = (n: number): number[] => [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f];
  const id3 = frames.length > 0 ? [...enc("ID3"), 3, 0, 0, ...syncSafe(frames.length), ...frames] : [];

  // A single MPEG-1 layer III frame header: 128 kbps, 44100 Hz, joint stereo.
  const header = [0xff, 0xfb, 0x90, 0x44];
  const sideInfo = new Array(32).fill(0);
  const xing = [...enc("Xing"), ...u32be(0)];
  const lame = options.lame ? enc(options.lame.padEnd(9, " ").slice(0, 9)) : [];
  const padding = new Array(Math.max(0, 417 - (4 + 32 + xing.length + lame.length))).fill(0);
  return Uint8Array.from([...id3, ...header, ...sideInfo, ...xing, ...lame, ...padding]);
}
