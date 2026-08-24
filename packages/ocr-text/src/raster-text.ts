/**
 * Read type back out of pixels, reusing the decoder that already guards the export figure.
 *
 * `@slop/reproduce/ocr.ts` exists for the one test whose failure is legal exposure: render
 * every export size, decode the finished PNG, and prove the disclaimer is still there at the
 * right pixel height. That decoder is deliberately strict, and the strictness is what makes it
 * safe to point at somebody else's image:
 *
 *   - ink is a fixed threshold, so there is no adaptive parameter to tune and none to fool;
 *   - a band whose height is not an exact multiple of the glyph grid is skipped;
 *   - a band that decodes to mostly unknown glyphs is DISCARDED, not reported.
 *
 * So the failure mode is silence, never invention. That is the property this module is built
 * on, and it is why the confidence below is computed over what survived rather than asserted:
 * a caller gets either a string it can quote verbatim or a stated reason there is none.
 *
 * WHAT THIS WILL AND WILL NOT READ, measured rather than promised: type drawn on a pixel grid
 * (exports, plates, receipts, pixel-font banners) reads exactly. Antialiased web type in a
 * screenshot, and any photograph, will not decode and will come back abstained. Do not read an
 * abstention as "this image contains no words".
 */

import { PngFormatError, decodePng, ocrLines } from "@slop/reproduce";

export interface RasterTextRead {
  readonly text: string;
  /** Share of decoded glyph cells that matched a known glyph. 0 when nothing decoded. */
  readonly confidence: number;
  /** Bands the decoder recovered. Zero with `abstained` set is the ordinary outcome. */
  readonly lines: number;
  /** Present when there is no usable read, saying why in words a report can print. */
  readonly abstained?: string;
}

/**
 * Below this, a read is reported but must not be used as evidence.
 *
 * The decoder already drops any band above 25% unknown glyphs, so a surviving line is
 * normally near 1. This floor is the second door: a page whose images decode to
 * "H?LL? W?RLD" has not been read, and a rule quoting that as recovered text would be
 * inventing an accusation out of noise.
 */
export const MIN_USABLE_CONFIDENCE = 0.75;

export function readRasterText(bytes: Uint8Array): RasterTextRead {
  let raster;
  try {
    raster = decodePng(bytes);
  } catch (error) {
    const detail = error instanceof PngFormatError ? error.message : (error as Error).message;
    return { text: "", confidence: 0, lines: 0, abstained: `the bytes could not be decoded as a raster: ${detail}` };
  }

  const lines = ocrLines(raster);
  if (lines.length === 0) {
    return {
      text: "",
      confidence: 0,
      lines: 0,
      abstained:
        "no line of type decoded on the fixed glyph grid. The decoder reads pixel-grid type exactly and refuses everything else, so this is the ordinary outcome for a photograph or for antialiased type, and it is NOT a finding that the image has no words in it.",
    };
  }

  const text = lines.map((l) => l.text).join("\n");
  const cells = [...text].filter((ch) => ch !== "\n" && ch !== " ").length;
  const unknown = [...text].filter((ch) => ch === "?").length;
  const confidence = cells === 0 ? 0 : (cells - unknown) / cells;

  if (confidence < MIN_USABLE_CONFIDENCE) {
    return {
      text,
      confidence,
      lines: lines.length,
      abstained: `${Math.round(confidence * 100)}% of the decoded glyphs matched, below the ${Math.round(
        MIN_USABLE_CONFIDENCE * 100,
      )}% floor. A partial decode is quoted for the record and used for nothing.`,
    };
  }

  return { text, confidence, lines: lines.length };
}
