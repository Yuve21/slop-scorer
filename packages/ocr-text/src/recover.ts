/**
 * One door, two decoders, and a record for every image either way.
 *
 * The contract that matters is that this function NEVER returns nothing. An image it cannot
 * read comes back with `abstained` set and a reason a report can print, because the whole
 * point of the exercise is to stop "we did not look" from rendering as "there was nothing
 * there". A caller that only ever saw successful reads would count a page of unreadable JPEGs
 * as a page with no text in its images, which is the vacuous pass with a camera on it.
 */

import { readRasterText } from "./raster-text.js";
import { extractSvgText } from "./svg.js";

export interface RecoverInput {
  /** Where the image came from. Becomes the citation locator. */
  readonly src: string;
  /** Content type as served, when it was served. The extension is the fallback. */
  readonly contentType?: string;
  readonly bytes: Uint8Array;
}

export interface RecoveredText {
  readonly src: string;
  readonly method: "svg-text" | "raster-ocr";
  readonly text: string;
  readonly confidence: number;
  readonly abstained?: string;
}

/** What this build can decode at all. Everything else is an honest abstention. */
export const SUPPORTED_MEDIA_TYPES: readonly string[] = ["image/svg+xml", "image/png"];

const looksSvg = (input: RecoverInput): boolean =>
  /image\/svg/i.test(input.contentType ?? "") || /\.svg(\?|#|$)/i.test(input.src);

const looksPng = (input: RecoverInput): boolean =>
  /image\/png/i.test(input.contentType ?? "") || /\.png(\?|#|$)/i.test(input.src);

export function recoverText(input: RecoverInput): RecoveredText {
  const { src } = input;

  if (looksSvg(input)) {
    const read = extractSvgText(Buffer.from(input.bytes).toString("utf8"));
    if (read.text.length === 0) {
      return {
        src,
        method: "svg-text",
        text: "",
        confidence: 0,
        abstained:
          read.elements === 0
            ? "the SVG draws no text elements, so there is nothing in it to read"
            : `${read.elements} text element(s) were found and none carried characters. Either the copy is drawn as paths (which this reader cannot see) or the scan is broken; both are stated rather than reported as a clean image.`,
      };
    }
    return { src, method: "svg-text", text: read.text, confidence: 1 };
  }

  if (looksPng(input)) {
    const read = readRasterText(input.bytes);
    return {
      src,
      method: "raster-ocr",
      text: read.text,
      confidence: read.confidence,
      ...(read.abstained ? { abstained: read.abstained } : {}),
    };
  }

  return {
    src,
    method: "raster-ocr",
    text: "",
    confidence: 0,
    abstained: `no decoder in this build for ${input.contentType || "this image type"}; the pixels were never examined. Supported: ${SUPPORTED_MEDIA_TYPES.join(", ")}.`,
  };
}
