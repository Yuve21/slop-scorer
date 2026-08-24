/**
 * Format dispatch by magic bytes.
 *
 * The extension is not consulted. A `.png` that is a JPEG is a real thing that happens every
 * time somebody renames a file, and a parser that trusted the name would report "no PNG text
 * chunks" about a file that has none because it is not a PNG. That reads as a clean bill of
 * health and it is the vacuous-probe failure this repository is built around.
 */

import { latin1 } from "./bytes.js";
import { parseIsoBmff } from "./isobmff.js";
import { parseJpeg } from "./jpeg.js";
import { parseMpegAudio } from "./mpeg-audio.js";
import { parsePng, PNG_SIGNATURE } from "./png.js";
import { parseRiff } from "./riff.js";
import { emptyContainer } from "./types.js";
import type { ContainerRecord } from "./types.js";

export function inspectContainer(bytes: Uint8Array): ContainerRecord {
  if (bytes.length < 12) return emptyContainer(bytes.length, ["file is too short to identify"]);

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return parseJpeg(bytes);
  if (PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return parsePng(bytes);

  const riffTag = latin1(bytes.subarray(0, 4));
  if (riffTag === "RIFF") {
    const form = latin1(bytes.subarray(8, 12));
    if (form === "WEBP") {
      // WebP is RIFF-shaped, and its chunk walk is the same one. The format label differs so
      // an image rule can tell a lossy VP8 payload from a WAVE.
      const record = parseRiff(bytes);
      return { ...record, format: "webp", shape: { ...record.shape, codec: "webp" } };
    }
    return parseRiff(bytes);
  }

  if (latin1(bytes.subarray(4, 8)) === "ftyp") return parseIsoBmff(bytes);
  if (latin1(bytes.subarray(0, 3)) === "ID3") return parseMpegAudio(bytes);
  if (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) return parseMpegAudio(bytes);
  if (latin1(bytes.subarray(0, 3)) === "GIF") {
    return {
      ...emptyContainer(bytes.length, []),
      format: "gif",
      segments: [{ name: "GIF header", offset: 0, length: 6, summary: latin1(bytes.subarray(0, 6)) }],
      shape: { width: bytes[6]! | (bytes[7]! << 8), height: bytes[8]! | (bytes[9]! << 8), codec: "gif" },
    };
  }

  return emptyContainer(bytes.length, [`unrecognised magic bytes: ${[...bytes.subarray(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join(" ")}`]);
}

export { parseIsoBmff, parseJpeg, parseMpegAudio, parsePng, parseRiff };
export { sameWriter } from "./mpeg-audio.js";
export { estimateQuality, IJG_LUMA_REFERENCE_SUM, IJG_LUMA_TABLE, readExifStrings } from "./jpeg.js";
export { crc32, PNG_SIGNATURE } from "./png.js";
export { at, clip, indexOfAscii, latin1, Reader, utf8 } from "./bytes.js";
export type {
  ContainerFormat,
  ContainerRecord,
  EncoderRecord,
  JpegRecord,
  MediaShape,
  MetadataPayload,
  PayloadKind,
  SegmentRecord,
} from "./types.js";
export { emptyContainer } from "./types.js";
